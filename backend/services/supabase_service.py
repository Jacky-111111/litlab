import os
import re
from datetime import datetime, timezone
from typing import Any

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from supabase import Client, create_client


_auth_scheme = HTTPBearer(auto_error=False)


def _build_supabase_client() -> Client | None:
    url = os.getenv("SUPABASE_URL")
    key = os.getenv("SUPABASE_SERVICE_ROLE_KEY") or os.getenv("SUPABASE_ANON_KEY")
    if not url or not key:
        return None
    return create_client(url, key)


def _require_supabase() -> Client:
    supabase_client = _build_supabase_client()
    if not supabase_client:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Supabase is not configured. Add SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.",
        )
    return supabase_client


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(_auth_scheme),
) -> dict[str, str]:
    if credentials is None or not credentials.credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing access token. Please log in.",
        )

    token = credentials.credentials
    client = _require_supabase()
    try:
        response = client.auth.get_user(token)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Invalid authentication token: {exc}",
        ) from exc

    user = getattr(response, "user", None)
    user_id = getattr(user, "id", None)
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not identify authenticated user.",
        )

    email = getattr(user, "email", "") or ""
    return {"id": user_id, "email": email}


def get_current_user_id(
    user: dict[str, str] = Depends(get_current_user),
) -> str:
    return user["id"]


def list_projects_for_user(user_id: str) -> list[dict[str, Any]]:
    client = _require_supabase()
    response = (
        client.table("projects")
        .select("*")
        .eq("user_id", user_id)
        .order("updated_at", desc=True)
        .execute()
    )
    return response.data or []


def get_project_for_user(project_id: str, user_id: str) -> dict[str, Any] | None:
    client = _require_supabase()
    response = (
        client.table("projects")
        .select("*")
        .eq("id", project_id)
        .eq("user_id", user_id)
        .limit(1)
        .execute()
    )
    rows = response.data or []
    return rows[0] if rows else None


def create_project_for_user(user_id: str, payload: dict[str, Any]) -> dict[str, Any]:
    client = _require_supabase()
    insert_payload = {**payload, "user_id": user_id}
    response = client.table("projects").insert(insert_payload).execute()
    rows = response.data or []
    if not rows:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to create project.",
        )
    return rows[0]


def update_project_for_user(project_id: str, user_id: str, payload: dict[str, Any]) -> dict[str, Any] | None:
    client = _require_supabase()
    response = (
        client.table("projects")
        .update(payload)
        .eq("id", project_id)
        .eq("user_id", user_id)
        .execute()
    )
    rows = response.data or []
    return rows[0] if rows else None


def delete_project_for_user(project_id: str, user_id: str) -> None:
    client = _require_supabase()
    client.table("projects").delete().eq("id", project_id).eq("user_id", user_id).execute()


def list_saved_papers(project_id: str) -> list[dict[str, Any]]:
    client = _require_supabase()
    links = (
        client.table("collection_papers")
        .select("paper_id")
        .eq("collection_id", project_id)
        .order("added_at", desc=True)
        .execute()
    )
    paper_ids = [row.get("paper_id") for row in (links.data or []) if row.get("paper_id")]
    if not paper_ids:
        legacy = (
            client.table("saved_papers")
            .select("*")
            .eq("project_id", project_id)
            .order("created_at", desc=True)
            .execute()
        )
        return [_paper_row_to_response(row) for row in (legacy.data or [])]

    papers = client.table("papers").select("*").in_("id", paper_ids).execute()
    paper_rows = papers.data or []
    paper_map = {row.get("id"): _paper_row_to_response(row) for row in paper_rows if row.get("id")}
    return [paper_map[paper_id] for paper_id in paper_ids if paper_id in paper_map]


def save_paper(project_id: str, payload: dict[str, Any], user_id: str | None = None) -> dict[str, Any]:
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="user_id is required when saving a paper.",
        )
    paper = create_or_update_paper_for_user(user_id, payload)
    add_paper_to_collection(project_id=project_id, paper_id=paper["id"], user_id=user_id)
    return paper


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _normalize_authors(authors: Any) -> list[str]:
    if not isinstance(authors, list):
        return []
    cleaned: list[str] = []
    seen = set()
    for item in authors:
        name = str(item or "").strip()
        if not name:
            continue
        key = name.casefold()
        if key in seen:
            continue
        seen.add(key)
        cleaned.append(name)
    return cleaned[:12]


def _extract_last_name(author: str) -> str:
    cleaned = str(author or "").strip()
    if not cleaned:
        return "Unknown"
    parts = cleaned.split()
    return parts[-1] if parts else "Unknown"


def _format_apa_name(author: str) -> str:
    cleaned = str(author or "").strip()
    if not cleaned:
        return "Unknown"
    parts = cleaned.split()
    if not parts:
        return "Unknown"
    last = parts[-1]
    initials = " ".join([f"{part[0]}." for part in parts[:-1] if part])
    return f"{last}, {initials}".strip().rstrip(",")


def _build_citation_strings(title: str, authors: list[str], year: int | None, url: str) -> dict[str, str]:
    safe_title = (title or "Untitled paper").strip() or "Untitled paper"
    safe_year = str(year) if year else "n.d."
    safe_url = (url or "").strip()
    safe_authors = authors or []

    if safe_authors:
        mla_author = (
            f"{_extract_last_name(safe_authors[0])}, {safe_authors[0].rsplit(' ', 1)[0]}".strip(", ")
            if len(safe_authors) == 1
            else f"{_extract_last_name(safe_authors[0])}, {safe_authors[0].rsplit(' ', 1)[0]}, et al."
        )
        apa_author = _format_apa_name(safe_authors[0]) if len(safe_authors) == 1 else f"{_format_apa_name(safe_authors[0])}, et al."
        chicago_author = ", ".join(safe_authors[:2]) + (" et al." if len(safe_authors) > 2 else "")
    else:
        mla_author = "Unknown"
        apa_author = "Unknown"
        chicago_author = "Unknown"

    mla = f'{mla_author}. "{safe_title}." {safe_year}.'
    apa = f"{apa_author} ({safe_year}). {safe_title}."
    chicago = f"{chicago_author}. {safe_year}. \"{safe_title}.\""

    if safe_url:
        mla = f"{mla} {safe_url}"
        apa = f"{apa} {safe_url}"
        chicago = f"{chicago} {safe_url}"

    return {"mla": mla.strip(), "apa": apa.strip(), "chicago": chicago.strip()}


def _paper_row_to_response(row: dict[str, Any]) -> dict[str, Any]:
    title = row.get("title") or "Untitled paper"
    nickname = str(row.get("nickname") or "").strip() or title or "Untitled"
    citations = {
        "mla": str(row.get("citation_mla") or "").strip(),
        "apa": str(row.get("citation_apa") or "").strip(),
        "chicago": str(row.get("citation_chicago") or "").strip(),
    }
    if not all(citations.values()):
        citations = _build_citation_strings(
            title=title,
            authors=_normalize_authors(row.get("authors_json") or row.get("authors") or []),
            year=row.get("year"),
            url=row.get("canonical_url") or row.get("url") or "",
        )
    return {
        "id": row.get("id", ""),
        "external_paper_id": row.get("external_paper_id") or "",
        "source": row.get("source") or "Unknown",
        "title": title,
        "nickname": nickname,
        "authors": _normalize_authors(row.get("authors_json") or row.get("authors") or []),
        "year": row.get("year"),
        "abstract": row.get("abstract") or "",
        "url": row.get("canonical_url") or row.get("url") or "",
        "pdf_storage_path": row.get("pdf_storage_path") or "",
        "content_hash": row.get("content_hash") or "",
        "citation_mla": citations["mla"],
        "citation_apa": citations["apa"],
        "citation_chicago": citations["chicago"],
        "citations": citations,
        "created_at": row.get("created_at"),
        "updated_at": row.get("updated_at"),
    }


def _find_existing_paper(
    *,
    user_id: str,
    source: str,
    external_paper_id: str,
    content_hash: str,
    canonical_url: str,
) -> dict[str, Any] | None:
    client = _require_supabase()
    if external_paper_id:
        response = (
            client.table("papers")
            .select("*")
            .eq("user_id", user_id)
            .eq("source", source)
            .eq("external_paper_id", external_paper_id)
            .limit(1)
            .execute()
        )
        rows = response.data or []
        if rows:
            return rows[0]

    if content_hash:
        response = (
            client.table("papers")
            .select("*")
            .eq("user_id", user_id)
            .eq("content_hash", content_hash)
            .limit(1)
            .execute()
        )
        rows = response.data or []
        if rows:
            return rows[0]

    if canonical_url:
        response = (
            client.table("papers")
            .select("*")
            .eq("user_id", user_id)
            .eq("canonical_url", canonical_url)
            .limit(1)
            .execute()
        )
        rows = response.data or []
        if rows:
            return rows[0]

    return None


def create_or_update_paper_for_user(user_id: str, payload: dict[str, Any]) -> dict[str, Any]:
    client = _require_supabase()
    source = str(payload.get("source") or "Manual").strip() or "Manual"
    external_paper_id = str(payload.get("external_paper_id") or "").strip()
    canonical_url = str(payload.get("url") or payload.get("canonical_url") or "").strip()
    content_hash = str(payload.get("content_hash") or "").strip()
    title = str(payload.get("title") or "").strip() or "Untitled paper"
    nickname = str(payload.get("nickname") or "").strip() or title or "Untitled"
    abstract = str(payload.get("abstract") or "").strip()
    normalized_authors = _normalize_authors(payload.get("authors"))
    citations = _build_citation_strings(
        title=title,
        authors=normalized_authors,
        year=payload.get("year"),
        url=canonical_url,
    )
    existing = _find_existing_paper(
        user_id=user_id,
        source=source,
        external_paper_id=external_paper_id,
        content_hash=content_hash,
        canonical_url=canonical_url,
    )
    now_iso = _now_iso()
    base_payload = {
        "user_id": user_id,
        "source": source,
        "external_paper_id": external_paper_id or None,
        "title": title,
        "nickname": nickname,
        "authors_json": normalized_authors,
        "year": payload.get("year"),
        "abstract": abstract,
        "canonical_url": canonical_url,
        "pdf_storage_path": str(payload.get("pdf_storage_path") or "").strip() or None,
        "content_hash": content_hash or None,
        "citation_mla": str(payload.get("citation_mla") or citations["mla"]).strip(),
        "citation_apa": str(payload.get("citation_apa") or citations["apa"]).strip(),
        "citation_chicago": str(payload.get("citation_chicago") or citations["chicago"]).strip(),
        "updated_at": now_iso,
    }

    if existing:
        update_payload: dict[str, Any] = {"updated_at": now_iso}
        if base_payload["title"] and (not existing.get("title") or existing.get("title") == "Untitled paper"):
            update_payload["title"] = base_payload["title"]
        if base_payload["nickname"] and (
            not str(existing.get("nickname") or "").strip()
            or str(existing.get("nickname") or "").strip() == str(existing.get("title") or "").strip()
        ):
            update_payload["nickname"] = base_payload["nickname"]
        if base_payload["abstract"] and len(base_payload["abstract"]) > len(str(existing.get("abstract") or "")):
            update_payload["abstract"] = base_payload["abstract"]
        if base_payload["authors_json"] and not existing.get("authors_json"):
            update_payload["authors_json"] = base_payload["authors_json"]
        if base_payload["year"] and not existing.get("year"):
            update_payload["year"] = base_payload["year"]
        if base_payload["canonical_url"] and not existing.get("canonical_url"):
            update_payload["canonical_url"] = base_payload["canonical_url"]
        if base_payload["pdf_storage_path"] and not existing.get("pdf_storage_path"):
            update_payload["pdf_storage_path"] = base_payload["pdf_storage_path"]
        if base_payload["content_hash"] and not existing.get("content_hash"):
            update_payload["content_hash"] = base_payload["content_hash"]
        if base_payload["citation_mla"]:
            update_payload["citation_mla"] = base_payload["citation_mla"]
        if base_payload["citation_apa"]:
            update_payload["citation_apa"] = base_payload["citation_apa"]
        if base_payload["citation_chicago"]:
            update_payload["citation_chicago"] = base_payload["citation_chicago"]

        response = client.table("papers").update(update_payload).eq("id", existing["id"]).eq("user_id", user_id).execute()
        rows = response.data or []
        return _paper_row_to_response(rows[0] if rows else existing)

    insert_payload = {**base_payload, "created_at": now_iso}
    response = client.table("papers").insert(insert_payload).execute()
    rows = response.data or []
    if not rows:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to create paper record.",
        )
    return _paper_row_to_response(rows[0])


def list_papers_for_user(user_id: str, query: str = "", limit: int = 20, offset: int = 0) -> list[dict[str, Any]]:
    client = _require_supabase()
    safe_limit = max(1, min(limit, 100))
    safe_offset = max(0, offset)
    request = client.table("papers").select("*").eq("user_id", user_id).order("updated_at", desc=True)
    if query.strip():
        like_value = f"%{query.strip()}%"
        request = request.or_(f"title.ilike.{like_value},nickname.ilike.{like_value}")
    response = request.range(safe_offset, safe_offset + safe_limit - 1).execute()
    return [_paper_row_to_response(row) for row in (response.data or [])]


def get_paper_for_user(paper_id: str, user_id: str) -> dict[str, Any] | None:
    client = _require_supabase()
    response = client.table("papers").select("*").eq("id", paper_id).eq("user_id", user_id).limit(1).execute()
    rows = response.data or []
    if not rows:
        return None
    return _paper_row_to_response(rows[0])


def update_paper_nickname_for_user(paper_id: str, user_id: str, nickname: str) -> dict[str, Any] | None:
    client = _require_supabase()
    clean_nickname = nickname.strip()
    if not clean_nickname:
        row = get_paper_for_user(paper_id, user_id)
        if not row:
            return None
        clean_nickname = row.get("title") or "Untitled"
    response = (
        client.table("papers")
        .update({"nickname": clean_nickname, "updated_at": _now_iso()})
        .eq("id", paper_id)
        .eq("user_id", user_id)
        .execute()
    )
    rows = response.data or []
    if not rows:
        return None
    return _paper_row_to_response(rows[0])


def update_paper_url_for_user(paper_id: str, user_id: str, url: str) -> dict[str, Any] | None:
    existing = get_paper_for_user(paper_id, user_id)
    if not existing:
        return None
    clean_url = url.strip()
    citations = _build_citation_strings(
        title=str(existing.get("title") or "Untitled paper"),
        authors=_normalize_authors(existing.get("authors") or []),
        year=existing.get("year"),
        url=clean_url,
    )
    client = _require_supabase()
    response = (
        client.table("papers")
        .update(
            {
                "canonical_url": clean_url,
                "citation_mla": citations["mla"],
                "citation_apa": citations["apa"],
                "citation_chicago": citations["chicago"],
                "updated_at": _now_iso(),
            }
        )
        .eq("id", paper_id)
        .eq("user_id", user_id)
        .execute()
    )
    rows = response.data or []
    if not rows:
        return None
    return _paper_row_to_response(rows[0])


def list_collection_ids_for_paper(paper_id: str, user_id: str) -> list[str]:
    client = _require_supabase()
    project_rows = list_projects_for_user(user_id)
    allowed_ids = {project.get("id") for project in project_rows if project.get("id")}
    links = client.table("collection_papers").select("collection_id").eq("paper_id", paper_id).execute()
    linked_ids = [row.get("collection_id") for row in (links.data or []) if row.get("collection_id")]
    return [collection_id for collection_id in linked_ids if collection_id in allowed_ids]


def add_paper_to_collection(project_id: str, paper_id: str, user_id: str) -> None:
    project = get_project_for_user(project_id, user_id)
    if not project:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Collection not found.")
    client = _require_supabase()
    client.table("collection_papers").upsert(
        {"collection_id": project_id, "paper_id": paper_id, "added_at": _now_iso(), "added_by": user_id},
        on_conflict="collection_id,paper_id",
    ).execute()


def batch_add_papers_to_collection(project_id: str, paper_ids: list[str], user_id: str) -> int:
    project = get_project_for_user(project_id, user_id)
    if not project:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Collection not found.")
    deduped_ids = []
    seen = set()
    for paper_id in paper_ids:
        clean_id = str(paper_id or "").strip()
        if not clean_id or clean_id in seen:
            continue
        seen.add(clean_id)
        deduped_ids.append(clean_id)
    if not deduped_ids:
        return 0

    client = _require_supabase()
    payload = [
        {"collection_id": project_id, "paper_id": paper_id, "added_at": _now_iso(), "added_by": user_id}
        for paper_id in deduped_ids
    ]
    client.table("collection_papers").upsert(payload, on_conflict="collection_id,paper_id").execute()
    return len(deduped_ids)


def batch_remove_papers_from_collection(project_id: str, paper_ids: list[str], user_id: str) -> int:
    project = get_project_for_user(project_id, user_id)
    if not project:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Collection not found.")
    deduped_ids = []
    seen = set()
    for paper_id in paper_ids:
        clean_id = str(paper_id or "").strip()
        if not clean_id or clean_id in seen:
            continue
        seen.add(clean_id)
        deduped_ids.append(clean_id)
    if not deduped_ids:
        return 0

    client = _require_supabase()
    client.table("collection_papers").delete().eq("collection_id", project_id).in_("paper_id", deduped_ids).execute()
    return len(deduped_ids)


def get_or_update_paper_note(paper_id: str, user_id: str, content: str | None = None) -> dict[str, Any]:
    client = _require_supabase()
    if content is not None:
        response = client.table("paper_notes").upsert(
            {
                "paper_id": paper_id,
                "user_id": user_id,
                "content": content,
                "updated_at": _now_iso(),
            },
            on_conflict="paper_id,user_id",
        ).execute()
        rows = response.data or []
        if rows:
            return rows[0]

    existing = (
        client.table("paper_notes")
        .select("*")
        .eq("paper_id", paper_id)
        .eq("user_id", user_id)
        .limit(1)
        .execute()
    )
    rows = existing.data or []
    if rows:
        return rows[0]
    return {"paper_id": paper_id, "user_id": user_id, "content": "", "updated_at": None}


def get_paper_ai_cache(
    *,
    paper_id: str,
    user_id: str,
    kind: str,
    prompt_hash: str,
) -> dict[str, Any] | None:
    client = _require_supabase()
    response = (
        client.table("paper_ai_cache")
        .select("*")
        .eq("paper_id", paper_id)
        .eq("user_id", user_id)
        .eq("kind", kind)
        .eq("prompt_hash", prompt_hash)
        .limit(1)
        .execute()
    )
    rows = response.data or []
    return rows[0] if rows else None


def upsert_paper_ai_cache(
    *,
    paper_id: str,
    user_id: str,
    kind: str,
    prompt_hash: str,
    model: str,
    payload_json: dict[str, Any],
) -> dict[str, Any]:
    client = _require_supabase()
    now_iso = _now_iso()
    response = client.table("paper_ai_cache").upsert(
        {
            "paper_id": paper_id,
            "user_id": user_id,
            "kind": kind,
            "prompt_hash": prompt_hash,
            "model": model,
            "payload_json": payload_json,
            "updated_at": now_iso,
            "created_at": now_iso,
        },
        on_conflict="paper_id,user_id,kind,prompt_hash",
    ).execute()
    rows = response.data or []
    if not rows:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to cache AI response.",
        )
    return rows[0]


def count_daily_ai_writes(user_id: str) -> int:
    client = _require_supabase()
    day_start = datetime.now(timezone.utc).strftime("%Y-%m-%dT00:00:00+00:00")
    response = (
        client.table("paper_ai_cache")
        .select("id")
        .eq("user_id", user_id)
        .gte("created_at", day_start)
        .execute()
    )
    return len(response.data or [])


def upload_pdf_for_user(user_id: str, filename: str, pdf_bytes: bytes, content_hash: str) -> str:
    client = _require_supabase()
    bucket = os.getenv("SUPABASE_PDF_BUCKET", "paper-pdfs")
    cleaned_filename = re.sub(r"[^a-zA-Z0-9_.-]+", "-", filename or "uploaded.pdf").strip("-") or "uploaded.pdf"
    object_path = f"{user_id}/{content_hash[:16]}-{cleaned_filename}"
    try:
        client.storage.from_(bucket).upload(
            path=object_path,
            file=pdf_bytes,
            file_options={"content-type": "application/pdf", "upsert": "false"},
        )
    except Exception:  # noqa: BLE001
        # If upload fails because object already exists, we still reuse the path.
        pass
    return object_path


def download_pdf_from_storage(object_path: str) -> bytes | None:
    if not object_path:
        return None
    client = _require_supabase()
    bucket = os.getenv("SUPABASE_PDF_BUCKET", "paper-pdfs")
    try:
        data = client.storage.from_(bucket).download(object_path)
    except Exception:  # noqa: BLE001
        return None
    return data if isinstance(data, bytes) and data else None


def create_signed_pdf_url(object_path: str, expires_in_seconds: int = 3600) -> str | None:
    if not object_path:
        return None
    client = _require_supabase()
    bucket = os.getenv("SUPABASE_PDF_BUCKET", "paper-pdfs")
    try:
        response = client.storage.from_(bucket).create_signed_url(path=object_path, expires_in=expires_in_seconds)
    except Exception:  # noqa: BLE001
        return None

    if isinstance(response, str):
        return response
    if isinstance(response, dict):
        return response.get("signedURL") or response.get("signedUrl") or response.get("signed_url")
    return None


def get_user_profile(user_id: str) -> dict[str, Any] | None:
    client = _require_supabase()
    response = (
        client.table("user_profiles")
        .select("*")
        .eq("user_id", user_id)
        .limit(1)
        .execute()
    )
    rows = response.data or []
    return rows[0] if rows else None


def upsert_user_profile(user_id: str, payload: dict[str, Any]) -> dict[str, Any]:
    client = _require_supabase()
    response = (
        client.table("user_profiles")
        .upsert({**payload, "user_id": user_id}, on_conflict="user_id")
        .execute()
    )
    rows = response.data or []
    if not rows:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to save profile.",
        )
    return rows[0]
