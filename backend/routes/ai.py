import base64
import os
import re
from collections import Counter
from datetime import datetime, timezone
from hashlib import sha256
from threading import Lock
from time import time

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field, HttpUrl

try:
    from ..prompts.paper_prompts import (
        explain_prompt,
        quiz_prompt,
        read_paper_analysis_prompt,
        summary_prompt,
    )
    from ..prompts.project_prompts import project_advisor_prompt
    from ..services.openai_service import generate_json, generate_text
    from ..services.paper_reader_service import extract_paper_from_pdf_bytes, extract_paper_from_url
    from ..services.paper_search_service import search_author_profiles, search_papers
    from ..services.supabase_service import (
        add_paper_to_collection,
        count_daily_ai_writes,
        create_or_update_paper_for_user,
        download_pdf_from_storage,
        get_current_user_id,
        get_paper_ai_cache,
        get_paper_for_user,
        get_project_for_user,
        list_collections_for_project,
        list_papers_in_collection,
        upsert_paper_ai_cache,
        upload_pdf_for_user,
    )
except ImportError:
    from prompts.paper_prompts import explain_prompt, quiz_prompt, read_paper_analysis_prompt, summary_prompt
    from prompts.project_prompts import project_advisor_prompt
    from services.openai_service import generate_json, generate_text
    from services.paper_reader_service import extract_paper_from_pdf_bytes, extract_paper_from_url
    from services.paper_search_service import search_author_profiles, search_papers
    from services.supabase_service import (
        add_paper_to_collection,
        count_daily_ai_writes,
        create_or_update_paper_for_user,
        download_pdf_from_storage,
        get_current_user_id,
        get_paper_ai_cache,
        get_paper_for_user,
        get_project_for_user,
        list_collections_for_project,
        list_papers_in_collection,
        upsert_paper_ai_cache,
        upload_pdf_for_user,
    )

router = APIRouter(prefix="/ai", tags=["ai"])
_rate_lock = Lock()
_ai_timestamps: dict[str, list[float]] = {}
_window_seconds = int(os.getenv("AI_RATE_LIMIT_WINDOW_SECONDS", "60"))
_max_requests_per_window = int(os.getenv("AI_RATE_LIMIT_REQUESTS", "20"))
_daily_cache_writes_quota = int(os.getenv("AI_DAILY_CACHE_WRITES", "120"))

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
    nickname: str = ""
    authors: list[str] = Field(default_factory=list)
    year: int | None = None
    abstract: str = ""
    url: str = ""
    pdf_storage_path: str = ""
    content_hash: str = ""
    citation_mla: str = ""
    citation_apa: str = ""
    citation_chicago: str = ""
    citations: dict = Field(default_factory=dict)


class AIPaperRequest(BaseModel):
    paper: PaperContext


class ReadPaperUrlRequest(BaseModel):
    url: HttpUrl
    collection_ids: list[str] = Field(default_factory=list)
    persist: bool = True


class ReadPaperPdfRequest(BaseModel):
    filename: str = "uploaded.pdf"
    pdf_base64: str = Field(min_length=1)
    collection_ids: list[str] = Field(default_factory=list)
    persist: bool = True


class ProjectAdvisorRequest(BaseModel):
    notes: dict[str, str] = Field(default_factory=dict)


class AICacheResponse(BaseModel):
    kind: str
    paper_id: str


def _enforce_ai_guardrails(user_id: str) -> None:
    now = time()
    with _rate_lock:
        bucket = _ai_timestamps.setdefault(user_id, [])
        min_ts = now - _window_seconds
        while bucket and bucket[0] < min_ts:
            bucket.pop(0)
        if len(bucket) >= _max_requests_per_window:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=f"Too many AI requests. Try again in {_window_seconds} seconds.",
            )
        bucket.append(now)

    if count_daily_ai_writes(user_id) >= _daily_cache_writes_quota:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Daily AI quota reached. Please try again tomorrow.",
        )


def _paper_prompt_for_kind(kind: str, paper: PaperContext) -> str:
    if kind == "summary":
        return summary_prompt(
            paper_title=paper.title,
            paper_abstract=paper.abstract,
            authors=paper.authors,
            year=paper.year,
        )
    if kind == "explain":
        return explain_prompt(
            paper_title=paper.title,
            paper_abstract=paper.abstract,
            authors=paper.authors,
            year=paper.year,
        )
    if kind == "quiz":
        return quiz_prompt(
            paper_title=paper.title,
            paper_abstract=paper.abstract,
            authors=paper.authors,
            year=paper.year,
        )
    raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Unsupported AI kind: {kind}")


def _prompt_hash(kind: str, paper: PaperContext) -> str:
    key = f"{kind}|{paper.title}|{paper.abstract}|{'|'.join(paper.authors)}|{paper.year}"
    return sha256(key.encode("utf-8")).hexdigest()


@router.post("/summarize")
def summarize(payload: AIPaperRequest, user_id: str = Depends(get_current_user_id)) -> dict[str, str]:
    _enforce_ai_guardrails(user_id)
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
def explain(payload: AIPaperRequest, user_id: str = Depends(get_current_user_id)) -> dict[str, str]:
    _enforce_ai_guardrails(user_id)
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
def quiz(payload: AIPaperRequest, user_id: str = Depends(get_current_user_id)) -> dict[str, str]:
    _enforce_ai_guardrails(user_id)
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
def recommend(payload: AIPaperRequest, user_id: str = Depends(get_current_user_id)) -> dict:
    _enforce_ai_guardrails(user_id)
    if not f"{payload.paper.title} {payload.paper.abstract}".strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Paper title or abstract is required for recommendations.",
        )
    return _recommend_related_papers(payload.paper)


def _build_read_paper_response(paper_data: dict) -> dict:
    paper = _enrich_paper_authors(PaperContext(**paper_data))
    if not paper.nickname.strip():
        paper.nickname = paper.title or "Untitled"
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


@router.post("/papers/{paper_id}/{kind}")
def run_cached_paper_ai(
    paper_id: str,
    kind: str,
    user_id: str = Depends(get_current_user_id),
) -> dict:
    _enforce_ai_guardrails(user_id)
    allowed = {"summary", "explain", "quiz", "recommend", "analysis"}
    if kind not in allowed:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Kind must be one of: {sorted(allowed)}")

    row = get_paper_for_user(paper_id, user_id)
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Paper not found.")
    paper = PaperContext(**row)
    p_hash = _prompt_hash(kind, paper)
    cached = get_paper_ai_cache(paper_id=paper_id, user_id=user_id, kind=kind, prompt_hash=p_hash)
    if cached:
        payload = cached.get("payload_json") or {}
        payload_paper = payload.get("paper") or {}
        return {
            "paper_id": paper_id,
            "kind": kind,
            "cached": True,
            **payload,
            "paper": {**row, **payload_paper},
        }

    if kind == "analysis":
        source_payload = {**row}
        url_fetch_failed = False
        # Reader mode auto-detection: if URL exists, try one fetch/extraction before first analysis cache.
        if row.get("url"):
            try:
                extracted = extract_paper_from_url(str(row.get("url")))
                source_payload = {**source_payload, **extracted, "nickname": row.get("nickname") or extracted.get("title", "")}
                refreshed = create_or_update_paper_for_user(user_id, source_payload)
                source_payload = {**source_payload, **refreshed}
            except Exception:  # noqa: BLE001
                source_payload = {**row}
                url_fetch_failed = True
        if row.get("pdf_storage_path") and (url_fetch_failed or not row.get("url")):
            try:
                pdf_bytes = download_pdf_from_storage(str(row.get("pdf_storage_path")))
                if pdf_bytes:
                    extracted = extract_paper_from_pdf_bytes(pdf_bytes=pdf_bytes, filename="stored.pdf", source_url=str(row.get("url") or ""))
                    source_payload = {**source_payload, **extracted, "nickname": row.get("nickname") or extracted.get("title", "")}
                    refreshed = create_or_update_paper_for_user(user_id, source_payload)
                    source_payload = {**source_payload, **refreshed}
            except Exception:  # noqa: BLE001
                source_payload = {**row}
        analysis_paper = PaperContext(**source_payload)
        p_hash = _prompt_hash(kind, analysis_paper)
        payload_json = _build_read_paper_response(source_payload)
    elif kind == "recommend":
        payload_json = _recommend_related_papers(paper)
    else:
        prompt = _paper_prompt_for_kind(kind, paper)
        payload_json = {"output": generate_text(prompt)}

    upsert_paper_ai_cache(
        paper_id=paper_id,
        user_id=user_id,
        kind=kind,
        prompt_hash=p_hash,
        model=os.getenv("OPENAI_MODEL", "gpt-4o-mini"),
        payload_json=payload_json,
    )
    latest_row = get_paper_for_user(paper_id, user_id) or row
    payload_paper = payload_json.get("paper") or {}
    return {
        "paper_id": paper_id,
        "kind": kind,
        "cached": False,
        **payload_json,
        "paper": {**latest_row, **payload_paper},
    }


@router.post("/read-paper/url")
def read_paper_from_url(payload: ReadPaperUrlRequest, user_id: str = Depends(get_current_user_id)) -> dict:
    _enforce_ai_guardrails(user_id)
    paper_data = extract_paper_from_url(str(payload.url))
    response_payload = _build_read_paper_response(paper_data)
    if payload.persist:
        paper_record = create_or_update_paper_for_user(user_id, response_payload["paper"])
        response_payload["paper"] = {**paper_record, **response_payload["paper"], "id": paper_record["id"]}
        for collection_id in payload.collection_ids:
            add_paper_to_collection(collection_id, paper_record["id"], user_id)
        prompt_hash = _prompt_hash("analysis", PaperContext(**response_payload["paper"]))
        upsert_paper_ai_cache(
            paper_id=paper_record["id"],
            user_id=user_id,
            kind="analysis",
            prompt_hash=prompt_hash,
            model=os.getenv("OPENAI_MODEL", "gpt-4o-mini"),
            payload_json={
                "analysis": response_payload.get("analysis", ""),
                "query": response_payload.get("query", ""),
                "papers": response_payload.get("papers", []),
                "author_profiles": response_payload.get("author_profiles", []),
            },
        )
    return response_payload


@router.post("/read-paper/pdf")
def read_paper_from_pdf(payload: ReadPaperPdfRequest, user_id: str = Depends(get_current_user_id)) -> dict:
    _enforce_ai_guardrails(user_id)
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
    if payload.persist:
        content_hash = sha256(pdf_bytes).hexdigest()
        paper_data["content_hash"] = content_hash
        paper_data["pdf_storage_path"] = upload_pdf_for_user(
            user_id=user_id,
            filename=filename,
            pdf_bytes=pdf_bytes,
            content_hash=content_hash,
        )
    response_payload = _build_read_paper_response(paper_data)
    if payload.persist:
        paper_record = create_or_update_paper_for_user(user_id, response_payload["paper"])
        response_payload["paper"] = {**paper_record, **response_payload["paper"], "id": paper_record["id"]}
        for collection_id in payload.collection_ids:
            add_paper_to_collection(collection_id, paper_record["id"], user_id)
        prompt_hash = _prompt_hash("analysis", PaperContext(**response_payload["paper"]))
        upsert_paper_ai_cache(
            paper_id=paper_record["id"],
            user_id=user_id,
            kind="analysis",
            prompt_hash=prompt_hash,
            model=os.getenv("OPENAI_MODEL", "gpt-4o-mini"),
            payload_json={
                "analysis": response_payload.get("analysis", ""),
                "query": response_payload.get("query", ""),
                "papers": response_payload.get("papers", []),
                "author_profiles": response_payload.get("author_profiles", []),
            },
        )
    return response_payload


# ---------------------------------------------------------------------------
# Project AI Direction Advisor
# ---------------------------------------------------------------------------


def _coerce_score(value, default: int = 0) -> int:
    try:
        score = int(round(float(value)))
    except (TypeError, ValueError):
        return default
    return max(0, min(10, score))


def _normalize_advisor_payload(raw: dict) -> dict:
    """Defensive normalization so the frontend always gets the same shape."""
    score_keys = [
        "innovation",
        "feasibility",
        "scope_clarity",
        "literature_coverage",
        "methodology_strength",
    ]

    raw_scores = raw.get("scores") if isinstance(raw.get("scores"), dict) else {}
    scores = {key: _coerce_score(raw_scores.get(key)) for key in score_keys}

    raw_rationales = raw.get("score_rationales") if isinstance(raw.get("score_rationales"), dict) else {}
    rationales = {key: str(raw_rationales.get(key) or "").strip() for key in score_keys}

    def _list_of_dicts(value) -> list[dict]:
        if not isinstance(value, list):
            return []
        return [item for item in value if isinstance(item, dict)]

    def _list_of_strings(value) -> list[str]:
        if not isinstance(value, list):
            return []
        return [str(item).strip() for item in value if str(item).strip()]

    return {
        "summary": str(raw.get("summary") or "").strip(),
        "scores": scores,
        "score_rationales": rationales,
        "writing_directions": _list_of_dicts(raw.get("writing_directions"))[:6],
        "innovation_angles": _list_of_dicts(raw.get("innovation_angles"))[:6],
        "risks": _list_of_dicts(raw.get("risks"))[:5],
        "next_steps": _list_of_strings(raw.get("next_steps"))[:6],
    }


@router.post("/projects/{project_id}/advise")
def advise_project_direction(
    project_id: str,
    payload: ProjectAdvisorRequest,
    user_id: str = Depends(get_current_user_id),
) -> dict:
    """Generate writing directions, innovation angles, and scores for a project.

    Reads the project metadata and all papers across its attached collections,
    combines them with the notes the student has filled in for the framework
    sections (sent from the client), and returns an actionable AI read-out.
    """
    _enforce_ai_guardrails(user_id)

    project = get_project_for_user(project_id, user_id)
    if not project:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found.")

    collections = list_collections_for_project(project_id, user_id)
    seen: set[str] = set()
    papers: list[dict] = []
    for collection in collections:
        collection_id = str(collection.get("id") or "").strip()
        if not collection_id:
            continue
        for paper in list_papers_in_collection(collection_id):
            paper_id = str(paper.get("id") or "").strip()
            if not paper_id or paper_id in seen:
                continue
            seen.add(paper_id)
            papers.append(paper)

    cleaned_notes = {
        str(section).strip(): str(content or "").strip()
        for section, content in (payload.notes or {}).items()
        if str(section).strip()
    }

    prompt = project_advisor_prompt(
        project_title=str(project.get("title") or ""),
        project_description=str(project.get("description") or ""),
        framework_type=str(project.get("framework_type") or ""),
        project_goal=str(project.get("goal") or ""),
        notes=cleaned_notes,
        papers=papers,
    )

    raw = generate_json(prompt, temperature=0.5)
    normalized = _normalize_advisor_payload(raw)

    filled_notes = sum(1 for value in cleaned_notes.values() if value)
    normalized["context"] = {
        "project_id": project_id,
        "framework_type": project.get("framework_type"),
        "paper_count": len(papers),
        "note_section_count": len(cleaned_notes),
        "filled_note_count": filled_notes,
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }
    return normalized
