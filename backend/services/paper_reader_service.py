import re
from io import BytesIO
from typing import Any

import requests
from fastapi import HTTPException, status

USER_AGENT = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"
)


def _normalize_whitespace(text: str) -> str:
    return re.sub(r"\s+", " ", text or "").strip()


def _extract_meta_values(html: str, key: str) -> list[str]:
    pattern = re.compile(
        r"<meta[^>]+(?:name|property)\s*=\s*[\"']"
        + re.escape(key)
        + r"[\"'][^>]*content\s*=\s*[\"']([^\"']+)[\"'][^>]*>",
        flags=re.IGNORECASE,
    )
    return [_normalize_whitespace(match) for match in pattern.findall(html) if _normalize_whitespace(match)]


def _strip_tags(html: str) -> str:
    without_scripts = re.sub(r"<script[^>]*>.*?</script>", " ", html, flags=re.IGNORECASE | re.DOTALL)
    without_styles = re.sub(r"<style[^>]*>.*?</style>", " ", without_scripts, flags=re.IGNORECASE | re.DOTALL)
    without_tags = re.sub(r"<[^>]+>", " ", without_styles)
    return _normalize_whitespace(without_tags)


def _guess_year(text: str) -> int | None:
    matches = re.findall(r"\b(19\d{2}|20\d{2})\b", text[:3000])
    if not matches:
        return None
    year = int(matches[0])
    if 1900 <= year <= 2100:
        return year
    return None


def _guess_title_from_filename(filename: str) -> str:
    stem = re.sub(r"\.pdf$", "", filename, flags=re.IGNORECASE)
    title = re.sub(r"[_\-]+", " ", stem)
    return _normalize_whitespace(title) or "Untitled paper"


def _guess_authors_from_pdf_metadata(metadata: Any) -> list[str]:
    if not metadata:
        return []

    author_raw = ""
    for key in ("/Author", "Author", "author"):
        value = getattr(metadata, "get", lambda *_args, **_kwargs: "")(key, "")
        if value:
            author_raw = str(value)
            break
    if not author_raw.strip():
        return []

    parts = re.split(r";| and |\n|, (?=[A-Z][a-z]+ [A-Z])", author_raw)
    candidates = []
    seen = set()
    for part in parts:
        name = _normalize_whitespace(part)
        if not name or len(name) > 80:
            continue
        if not re.search(r"[A-Za-z]", name):
            continue
        key = name.casefold()
        if key in seen:
            continue
        seen.add(key)
        candidates.append(name)
    return candidates[:8]


def _guess_authors_from_lines(lines: list[str], title: str) -> list[str]:
    if not lines:
        return []

    title_index = 0
    normalized_title = _normalize_whitespace(title).casefold()
    for idx, line in enumerate(lines[:30]):
        if normalized_title and normalized_title in _normalize_whitespace(line).casefold():
            title_index = idx
            break

    author_window = lines[title_index + 1 : title_index + 8]
    candidates: list[str] = []
    for line in author_window:
        normalized = _normalize_whitespace(line)
        if len(normalized) > 140 or len(normalized) < 5:
            continue
        if re.search(r"\b(abstract|introduction|keywords|doi|university|department)\b", normalized, flags=re.IGNORECASE):
            continue
        if "@" in normalized or re.search(r"\d", normalized):
            continue
        if "," in normalized or " and " in normalized:
            names = re.split(r",| and ", normalized)
            for name in names:
                cleaned = _normalize_whitespace(name)
                if re.match(r"^[A-Z][A-Za-z\-']+(?:\s+[A-Z][A-Za-z\-']+){1,3}$", cleaned):
                    candidates.append(cleaned)
        elif re.match(r"^[A-Z][A-Za-z\-']+(?:\s+[A-Z][A-Za-z\-']+){1,3}$", normalized):
            candidates.append(normalized)

    deduped: list[str] = []
    seen = set()
    for name in candidates:
        key = name.casefold()
        if key in seen:
            continue
        seen.add(key)
        deduped.append(name)
    return deduped[:8]


def extract_paper_from_url(url: str) -> dict[str, Any]:
    clean_url = _normalize_whitespace(url)
    if not clean_url:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Paper URL is required.")

    try:
        response = requests.get(
            clean_url,
            timeout=20,
            headers={"User-Agent": USER_AGENT},
            allow_redirects=True,
        )
        response.raise_for_status()
    except requests.RequestException as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Could not fetch paper URL: {exc}",
        ) from exc

    content_type = (response.headers.get("content-type") or "").lower()
    if "pdf" in content_type or clean_url.lower().endswith(".pdf"):
        return extract_paper_from_pdf_bytes(response.content, filename="uploaded-url.pdf", source_url=clean_url)

    html = response.text[:800_000]
    title_candidates = (
        _extract_meta_values(html, "citation_title")
        + _extract_meta_values(html, "og:title")
        + _extract_meta_values(html, "twitter:title")
    )
    title = title_candidates[0] if title_candidates else ""
    if not title:
        title_match = re.search(r"<title[^>]*>(.*?)</title>", html, flags=re.IGNORECASE | re.DOTALL)
        title = _normalize_whitespace(title_match.group(1)) if title_match else "Untitled paper"

    abstract_candidates = (
        _extract_meta_values(html, "citation_abstract")
        + _extract_meta_values(html, "description")
        + _extract_meta_values(html, "og:description")
        + _extract_meta_values(html, "twitter:description")
    )
    abstract = abstract_candidates[0] if abstract_candidates else ""

    authors = (
        _extract_meta_values(html, "citation_author")
        + _extract_meta_values(html, "dc.creator")
        + _extract_meta_values(html, "author")
    )
    deduped_authors = []
    seen = set()
    for author in authors:
        key = author.casefold()
        if key and key not in seen:
            seen.add(key)
            deduped_authors.append(author)

    if not abstract:
        page_text = _strip_tags(html)
        abstract = page_text[:1200]

    year_hint = " ".join(
        _extract_meta_values(html, "citation_publication_date") + _extract_meta_values(html, "article:published_time")
    )
    year = _guess_year(year_hint or abstract)

    return {
        "external_paper_id": "",
        "source": "URL Upload",
        "title": title or "Untitled paper",
        "authors": deduped_authors[:8],
        "year": year,
        "abstract": abstract,
        "url": clean_url,
    }


def extract_paper_from_pdf_bytes(
    pdf_bytes: bytes,
    filename: str = "uploaded.pdf",
    source_url: str = "",
) -> dict[str, Any]:
    if not pdf_bytes:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="PDF is empty.")

    try:
        from pypdf import PdfReader
    except ModuleNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="PDF parsing dependency missing. Install backend requirements first.",
        ) from exc

    try:
        reader = PdfReader(BytesIO(pdf_bytes))
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Could not parse PDF: {exc}",
        ) from exc

    pages_text: list[str] = []
    for page in reader.pages[:8]:
        try:
            page_text = page.extract_text() or ""
        except Exception:  # noqa: BLE001
            page_text = ""
        if page_text.strip():
            pages_text.append(page_text.strip())

    combined_text = _normalize_whitespace("\n".join(pages_text))
    if not combined_text:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Could not extract readable text from this PDF.",
        )

    lines = [line.strip() for line in re.split(r"[\r\n]+", "\n".join(pages_text)) if line.strip()]
    title = ""
    for line in lines[:20]:
        if 8 <= len(line) <= 180 and not re.match(r"^\d+$", line):
            title = _normalize_whitespace(line)
            break
    if not title:
        title = _guess_title_from_filename(filename)

    abstract_match = re.search(
        r"(?is)\babstract\b[:\s]*(.{120,3000}?)(?:\bkeywords?\b|\bindex terms\b|\b1\.?\s*introduction\b|\bi\.\s*introduction\b)",
        combined_text,
    )
    abstract = _normalize_whitespace(abstract_match.group(1)) if abstract_match else combined_text[:1400]
    year = _guess_year(combined_text)
    metadata_authors = _guess_authors_from_pdf_metadata(reader.metadata)
    line_authors = _guess_authors_from_lines(lines, title)
    authors = metadata_authors or line_authors

    return {
        "external_paper_id": "",
        "source": "PDF Upload",
        "title": title,
        "authors": authors,
        "year": year,
        "abstract": abstract,
        "url": source_url,
    }
