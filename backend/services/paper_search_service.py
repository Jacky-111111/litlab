from typing import Any

import requests
from fastapi import HTTPException, status

SEMANTIC_SCHOLAR_URL = "https://api.semanticscholar.org/graph/v1/paper/search"
SEMANTIC_SCHOLAR_AUTHOR_URL = "https://api.semanticscholar.org/graph/v1/author/search"


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


def search_author_profiles(author_names: list[str], per_author_limit: int = 1) -> list[dict[str, Any]]:
    cleaned_names = [name.strip() for name in author_names if name and name.strip()]
    if not cleaned_names:
        return []

    results: list[dict[str, Any]] = []
    max_per_author = max(1, min(per_author_limit, 3))
    for author_name in cleaned_names[:6]:
        params = {
            "query": author_name,
            "limit": max_per_author,
            "fields": "name,aliases,affiliations,homepage,url,paperCount,citationCount,hIndex",
        }
        try:
            response = requests.get(SEMANTIC_SCHOLAR_AUTHOR_URL, params=params, timeout=12)
            response.raise_for_status()
            payload = response.json()
        except requests.RequestException:
            # Author enrichment should be best-effort and never break primary flow.
            continue

        rows = payload.get("data", []) if isinstance(payload, dict) else []
        if not rows:
            continue
        top = rows[0]
        results.append(
            {
                "queried_name": author_name,
                "name": (top.get("name") or author_name).strip(),
                "affiliations": top.get("affiliations") or [],
                "homepage": top.get("homepage") or "",
                "profile_url": top.get("url") or "",
                "paper_count": top.get("paperCount"),
                "citation_count": top.get("citationCount"),
                "h_index": top.get("hIndex"),
                "aliases": top.get("aliases") or [],
            }
        )

    return results
