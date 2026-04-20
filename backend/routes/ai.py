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
    from ..services.paper_search_service import search_papers
except ImportError:
    from prompts.paper_prompts import explain_prompt, quiz_prompt, read_paper_analysis_prompt, summary_prompt
    from services.openai_service import generate_text
    from services.paper_reader_service import extract_paper_from_pdf_bytes, extract_paper_from_url
    from services.paper_search_service import search_papers

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


@router.post("/recommend")
def recommend(payload: AIPaperRequest) -> dict:
    if not f"{payload.paper.title} {payload.paper.abstract}".strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Paper title or abstract is required for recommendations.",
        )
    return _recommend_related_papers(payload.paper)


def _build_read_paper_response(paper_data: dict) -> dict:
    paper = PaperContext(**paper_data)
    analysis = generate_text(
        read_paper_analysis_prompt(
            paper_title=paper.title,
            paper_abstract=paper.abstract,
            authors=paper.authors,
            year=paper.year,
            source=paper.source or "Unknown",
            source_url=paper.url,
        )
    )
    response_payload: dict = {
        "paper": paper.model_dump(),
        "analysis": analysis,
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
