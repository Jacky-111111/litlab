import os
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


def get_current_user_id(
    credentials: HTTPAuthorizationCredentials | None = Depends(_auth_scheme),
) -> str:
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
    return user_id


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
    response = (
        client.table("saved_papers")
        .select("*")
        .eq("project_id", project_id)
        .order("created_at", desc=True)
        .execute()
    )
    return response.data or []


def save_paper(project_id: str, payload: dict[str, Any]) -> dict[str, Any]:
    client = _require_supabase()
    existing = (
        client.table("saved_papers")
        .select("*")
        .eq("project_id", project_id)
        .eq("external_paper_id", payload["external_paper_id"])
        .limit(1)
        .execute()
    )
    existing_rows = existing.data or []
    if existing_rows:
        return existing_rows[0]

    response = client.table("saved_papers").insert({**payload, "project_id": project_id}).execute()
    rows = response.data or []
    if not rows:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to save paper.",
        )
    return rows[0]
