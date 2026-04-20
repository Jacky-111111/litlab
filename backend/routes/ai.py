import re
from collections import Counter

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field

from prompts.paper_prompts import explain_prompt, quiz_prompt, summary_prompt
from services.openai_service import generate_text
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


@router.post("/recommend")
def recommend(payload: AIPaperRequest) -> dict:
    seed_text = f"{payload.paper.title} {payload.paper.abstract}".strip()
    if not seed_text:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Paper title or abstract is required for recommendations.",
        )

    keywords = _extract_keywords(seed_text)
    if not keywords:
        keywords = payload.paper.title.split()[:3]
    related_query = " ".join(keywords)
    papers = search_papers(related_query, limit=6)

    deduped = [
        paper
        for paper in papers
        if paper.get("external_paper_id") != payload.paper.external_paper_id
    ]
    return {"query": related_query, "papers": deduped[:5]}
