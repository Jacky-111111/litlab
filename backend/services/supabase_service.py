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


def _paper_row_to_response(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": row.get("id", ""),
        "external_paper_id": row.get("external_paper_id") or "",
        "source": row.get("source") or "Unknown",
        "title": row.get("title") or "Untitled paper",
        "authors": _normalize_authors(row.get("authors_json") or row.get("authors") or []),
        "year": row.get("year"),
        "abstract": row.get("abstract") or "",
        "url": row.get("canonical_url") or row.get("url") or "",
        "pdf_storage_path": row.get("pdf_storage_path") or "",
        "content_hash": row.get("content_hash") or "",
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
    abstract = str(payload.get("abstract") or "").strip()
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
        "authors_json": _normalize_authors(payload.get("authors")),
        "year": payload.get("year"),
        "abstract": abstract,
        "canonical_url": canonical_url,
        "pdf_storage_path": str(payload.get("pdf_storage_path") or "").strip() or None,
        "content_hash": content_hash or None,
        "updated_at": now_iso,
    }

    if existing:
        update_payload: dict[str, Any] = {"updated_at": now_iso}
        if base_payload["title"] and (not existing.get("title") or existing.get("title") == "Untitled paper"):
            update_payload["title"] = base_payload["title"]
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
        request = request.ilike("title", like_value)
    response = request.range(safe_offset, safe_offset + safe_limit - 1).execute()
    return [_paper_row_to_response(row) for row in (response.data or [])]


def get_paper_for_user(paper_id: str, user_id: str) -> dict[str, Any] | None:
    client = _require_supabase()
    response = client.table("papers").select("*").eq("id", paper_id).eq("user_id", user_id).limit(1).execute()
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
