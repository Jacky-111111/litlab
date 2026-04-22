import os
import time
from typing import Any

import requests
from fastapi import HTTPException, status

SEMANTIC_SCHOLAR_URL = "https://api.semanticscholar.org/graph/v1/paper/search"
SEMANTIC_SCHOLAR_AUTHOR_URL = "https://api.semanticscholar.org/graph/v1/author/search"

# Semantic Scholar throttles anonymous callers aggressively (shared IP pool).
# Registering a free API key greatly raises the limits; see
# https://www.semanticscholar.org/product/api.
_API_KEY_ENV = "SEMANTIC_SCHOLAR_API_KEY"
_MAX_RETRIES = 3
_RETRY_BACKOFF_SECONDS = (1.0, 2.0, 4.0)


def _build_headers() -> dict[str, str]:
    headers = {"User-Agent": "LitLab/1.0 (research assistant)"}
    api_key = (os.getenv(_API_KEY_ENV) or "").strip()
    if api_key:
        headers["x-api-key"] = api_key
    return headers


def _request_with_retry(url: str, params: dict[str, Any], timeout: int) -> requests.Response:
    """GET with exponential backoff on 429 / 5xx responses.

    Raises HTTPException(429) if still throttled after retries so the frontend
    can show a dedicated message. Other transport errors surface as 502.
    """
    headers = _build_headers()
    last_status: int | None = None
    last_retry_after: str | None = None

    for attempt in range(_MAX_RETRIES):
        try:
            response = requests.get(url, params=params, headers=headers, timeout=timeout)
        except requests.RequestException as exc:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=f"Paper search provider failed: {exc}",
            ) from exc

        if response.status_code < 400:
            return response

        last_status = response.status_code
        last_retry_after = response.headers.get("Retry-After")

        is_retryable = response.status_code == 429 or 500 <= response.status_code < 600
        if not is_retryable or attempt == _MAX_RETRIES - 1:
            break

        # Prefer server-specified Retry-After (seconds) when present.
        wait_seconds = _RETRY_BACKOFF_SECONDS[min(attempt, len(_RETRY_BACKOFF_SECONDS) - 1)]
        if last_retry_after:
            try:
                wait_seconds = max(wait_seconds, float(last_retry_after))
            except ValueError:
                pass
        time.sleep(wait_seconds)

    if last_status == 429:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=(
                "Semantic Scholar is rate-limiting public requests right now. "
                "Please wait a few seconds and try again. "
                "Admins can set SEMANTIC_SCHOLAR_API_KEY to raise the quota."
            ),
        )
    raise HTTPException(
        status_code=status.HTTP_502_BAD_GATEWAY,
        detail=f"Paper search provider returned HTTP {last_status}.",
    )


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
    response = _request_with_retry(SEMANTIC_SCHOLAR_URL, params=params, timeout=15)
    try:
        payload = response.json()
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Paper search provider returned an invalid response.",
        ) from exc

    results = payload.get("data", []) if isinstance(payload, dict) else []
    return [_normalize_paper(item) for item in results]


def search_author_profiles(author_names: list[str], per_author_limit: int = 1) -> list[dict[str, Any]]:
    cleaned_names = [name.strip() for name in author_names if name and name.strip()]
    if not cleaned_names:
        return []

    results: list[dict[str, Any]] = []
    max_per_author = max(1, min(per_author_limit, 3))
    headers = _build_headers()
    for author_name in cleaned_names[:6]:
        params = {
            "query": author_name,
            "limit": max_per_author,
            "fields": "name,aliases,affiliations,homepage,url,paperCount,citationCount,hIndex",
        }
        try:
            response = requests.get(
                SEMANTIC_SCHOLAR_AUTHOR_URL,
                params=params,
                headers=headers,
                timeout=12,
            )
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
