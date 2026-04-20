from typing import Any

import requests
from fastapi import HTTPException, status

SEMANTIC_SCHOLAR_URL = "https://api.semanticscholar.org/graph/v1/paper/search"


def _normalize_paper(raw: dict[str, Any]) -> dict[str, Any]:
    authors = [author.get("name", "").strip() for author in raw.get("authors", []) if author.get("name")]
    return {
        "external_paper_id": raw.get("paperId") or "",
        "source": "Semantic Scholar",
        "title": raw.get("title") or "Untitled",
        "authors": authors,
        "year": raw.get("year"),
        "abstract": raw.get("abstract") or "",
        "url": raw.get("url") or "",
    }


def search_papers(query: str, limit: int = 10) -> list[dict[str, Any]]:
    if not query.strip():
        return []

    params = {
        "query": query.strip(),
        "limit": max(1, min(limit, 20)),
        "fields": "paperId,title,authors,year,abstract,url,venue",
    }
    try:
        response = requests.get(SEMANTIC_SCHOLAR_URL, params=params, timeout=15)
        response.raise_for_status()
        payload = response.json()
    except requests.RequestException as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Paper search provider failed: {exc}",
        ) from exc

    results = payload.get("data", []) if isinstance(payload, dict) else []
    return [_normalize_paper(item) for item in results]
