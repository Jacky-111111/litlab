import base64
import re
from collections import Counter

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field, HttpUrl

try:
    from ..prompts.paper_prompts import (
        explain_prompt,
        quiz_prompt,
        read_paper_analysis_prompt,
        summary_prompt,
    )
    from ..services.openai_service import generate_text
    from ..services.paper_reader_service import extract_paper_from_pdf_bytes, extract_paper_from_url
    from ..services.paper_search_service import search_author_profiles, search_papers
except ImportError:
    from prompts.paper_prompts import explain_prompt, quiz_prompt, read_paper_analysis_prompt, summary_prompt
    from services.openai_service import generate_text
    from services.paper_reader_service import extract_paper_from_pdf_bytes, extract_paper_from_url
    from services.paper_search_service import search_author_profiles, search_papers

router = APIRouter(prefix="/ai", tags=["ai"])

STOPWORDS = {
    "the",
    "and",
    "for",
    "with",
    "that",
    "from",
    "this",
    "into",
    "using",
    "study",
    "paper",
    "analysis",
    "research",
    "based",
    "approach",
    "method",
}


class PaperContext(BaseModel):
    external_paper_id: str | None = None
    source: str | None = None
    title: str = Field(min_length=1)
    authors: list[str] = Field(default_factory=list)
    year: int | None = None
    abstract: str = ""
    url: str = ""


class AIPaperRequest(BaseModel):
    paper: PaperContext


class ReadPaperUrlRequest(BaseModel):
    url: HttpUrl


class ReadPaperPdfRequest(BaseModel):
    filename: str = "uploaded.pdf"
    pdf_base64: str = Field(min_length=1)


@router.post("/summarize")
def summarize(payload: AIPaperRequest) -> dict[str, str]:
    text = generate_text(
        summary_prompt(
            paper_title=payload.paper.title,
            paper_abstract=payload.paper.abstract,
            authors=payload.paper.authors,
            year=payload.paper.year,
        )
    )
    return {"output": text}


@router.post("/explain")
def explain(payload: AIPaperRequest) -> dict[str, str]:
    text = generate_text(
        explain_prompt(
            paper_title=payload.paper.title,
            paper_abstract=payload.paper.abstract,
            authors=payload.paper.authors,
            year=payload.paper.year,
        )
    )
    return {"output": text}


@router.post("/quiz")
def quiz(payload: AIPaperRequest) -> dict[str, str]:
    text = generate_text(
        quiz_prompt(
            paper_title=payload.paper.title,
            paper_abstract=payload.paper.abstract,
            authors=payload.paper.authors,
            year=payload.paper.year,
        )
    )
    return {"output": text}


def _extract_keywords(text: str) -> list[str]:
    words = re.findall(r"[a-zA-Z]{4,}", text.lower())
    filtered = [word for word in words if word not in STOPWORDS]
    return [word for word, _count in Counter(filtered).most_common(5)]


def _recommend_related_papers(paper: PaperContext) -> dict:
    seed_text = f"{paper.title} {paper.abstract}".strip()
    if not seed_text:
        return {"query": "", "papers": []}

    keywords = _extract_keywords(seed_text)
    if not keywords:
        keywords = paper.title.split()[:3]
    related_query = " ".join(keywords)
    papers = search_papers(related_query, limit=6)

    deduped = [
        item
        for item in papers
        if item.get("external_paper_id") != paper.external_paper_id
        and item.get("title", "").casefold() != paper.title.casefold()
    ]
    return {"query": related_query, "papers": deduped[:5]}


def _normalize_title(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", "", (text or "").lower())


def _enrich_paper_authors(paper: PaperContext) -> PaperContext:
    if paper.authors:
        return paper
    if not paper.title.strip():
        return paper

    try:
        candidates = search_papers(paper.title, limit=5)
    except HTTPException:
        return paper

    target = _normalize_title(paper.title)
    if not target:
        return paper

    best_authors: list[str] = []
    for item in candidates:
        candidate_title = _normalize_title(item.get("title", ""))
        if not candidate_title:
            continue
        if candidate_title == target or target in candidate_title or candidate_title in target:
            best_authors = item.get("authors") or []
            if best_authors:
                break

    if not best_authors and candidates:
        best_authors = candidates[0].get("authors") or []

    if best_authors:
        paper.authors = best_authors[:8]
    return paper


def _build_author_background_text(author_profiles: list[dict]) -> str:
    if not author_profiles:
        return ""

    lines = []
    for profile in author_profiles[:6]:
        affiliations = ", ".join(profile.get("affiliations") or []) or "Unknown affiliation"
        h_index = profile.get("h_index")
        citation_count = profile.get("citation_count")
        paper_count = profile.get("paper_count")
        metrics = []
        if h_index is not None:
            metrics.append(f"h-index {h_index}")
        if citation_count is not None:
            metrics.append(f"{citation_count} citations")
        if paper_count is not None:
            metrics.append(f"{paper_count} papers")
        metric_text = "; ".join(metrics) if metrics else "limited metrics"

        lines.append(f"- {profile.get('name', profile.get('queried_name', 'Unknown'))}: {affiliations}; {metric_text}")
    return "\n".join(lines)


def _enrich_author_profiles(paper: PaperContext) -> list[dict]:
    if not paper.authors:
        return []
    return search_author_profiles(paper.authors, per_author_limit=1)


@router.post("/recommend")
def recommend(payload: AIPaperRequest) -> dict:
    if not f"{payload.paper.title} {payload.paper.abstract}".strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Paper title or abstract is required for recommendations.",
        )
    return _recommend_related_papers(payload.paper)


def _build_read_paper_response(paper_data: dict) -> dict:
    paper = _enrich_paper_authors(PaperContext(**paper_data))
    author_profiles = _enrich_author_profiles(paper)
    author_background = _build_author_background_text(author_profiles)
    analysis = generate_text(
        read_paper_analysis_prompt(
            paper_title=paper.title,
            paper_abstract=paper.abstract,
            authors=paper.authors,
            year=paper.year,
            source=paper.source or "Unknown",
            source_url=paper.url,
            author_background=author_background,
        )
    )
    response_payload: dict = {
        "paper": paper.model_dump(),
        "analysis": analysis,
        "author_profiles": author_profiles,
        "query": "",
        "papers": [],
    }
    try:
        recommendations = _recommend_related_papers(paper)
        response_payload.update(recommendations)
    except HTTPException as exc:
        # Related paper search should not block core paper analysis.
        response_payload["recommendation_error"] = str(exc.detail)
    except Exception:  # noqa: BLE001
        response_payload["recommendation_error"] = "Related papers are temporarily unavailable."

    return response_payload


@router.post("/read-paper/url")
def read_paper_from_url(payload: ReadPaperUrlRequest) -> dict:
    paper_data = extract_paper_from_url(str(payload.url))
    return _build_read_paper_response(paper_data)


@router.post("/read-paper/pdf")
def read_paper_from_pdf(payload: ReadPaperPdfRequest) -> dict:
    filename = payload.filename or "uploaded.pdf"
    if not filename.lower().endswith(".pdf"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Please upload a PDF file.",
        )

    try:
        pdf_bytes = base64.b64decode(payload.pdf_base64, validate=True)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid PDF payload. Could not decode base64 data.",
        ) from exc

    if len(pdf_bytes) > 20 * 1024 * 1024:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="PDF too large. Please upload a file under 20MB.",
        )

    paper_data = extract_paper_from_pdf_bytes(pdf_bytes=pdf_bytes, filename=filename)
    return _build_read_paper_response(paper_data)
