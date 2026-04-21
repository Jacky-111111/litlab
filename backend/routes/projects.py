from datetime import datetime, timezone
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

try:
    from ..services.supabase_service import (
        attach_collection_to_project,
        create_project_with_primary_collection,
        delete_project_for_user,
        detach_collection_from_project,
        get_current_user_id,
        get_primary_collection_for_project,
        get_project_for_user,
        list_collections_for_project,
        list_projects_for_user,
        update_project_for_user,
    )
    from ..utils.framework_guidance import get_framework_guidance
except ImportError:
    from services.supabase_service import (
        attach_collection_to_project,
        create_project_with_primary_collection,
        delete_project_for_user,
        detach_collection_from_project,
        get_current_user_id,
        get_primary_collection_for_project,
        get_project_for_user,
        list_collections_for_project,
        list_projects_for_user,
        update_project_for_user,
    )
    from utils.framework_guidance import get_framework_guidance

router = APIRouter(prefix="/projects", tags=["projects"])

FrameworkType = Literal["IMRAD", "Review / Survey", "Theoretical Paper", "Case Study"]


class ProjectCreateRequest(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    description: str = Field(default="", max_length=4000)
    framework_type: FrameworkType
    goal: str = Field(default="", max_length=4000)
    status: str = Field(default="active", max_length=32)


class ProjectUpdateRequest(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=200)
    description: str | None = Field(default=None, max_length=4000)
    framework_type: FrameworkType | None = None
    goal: str | None = Field(default=None, max_length=4000)
    status: str | None = Field(default=None, max_length=32)


class ProjectCollectionAttachRequest(BaseModel):
    collection_id: str = Field(min_length=1)
    is_primary: bool = False


@router.get("")
def list_projects(user_id: str = Depends(get_current_user_id)) -> dict:
    return {"projects": list_projects_for_user(user_id)}


@router.post("", status_code=status.HTTP_201_CREATED)
def create_project(payload: ProjectCreateRequest, user_id: str = Depends(get_current_user_id)) -> dict:
    now_iso = datetime.now(timezone.utc).isoformat()
    result = create_project_with_primary_collection(
        user_id=user_id,
        payload={
            "title": payload.title.strip(),
            "description": payload.description.strip(),
            "framework_type": payload.framework_type,
            "goal": payload.goal.strip(),
            "status": payload.status.strip() or "active",
            "created_at": now_iso,
            "updated_at": now_iso,
        },
    )
    return {
        "project": result["project"],
        "primary_collection": result["primary_collection"],
    }


@router.get("/{project_id}")
def get_project(project_id: str, user_id: str = Depends(get_current_user_id)) -> dict:
    project = get_project_for_user(project_id, user_id)
    if not project:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found.")

    return {
        "project": project,
        "framework_guidance": get_framework_guidance(project.get("framework_type", "")),
    }


@router.put("/{project_id}")
def update_project(project_id: str, payload: ProjectUpdateRequest, user_id: str = Depends(get_current_user_id)) -> dict:
    existing = get_project_for_user(project_id, user_id)
    if not existing:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found.")

    update_payload = payload.model_dump(exclude_none=True)
    if not update_payload:
        return {"project": existing}

    if "title" in update_payload:
        update_payload["title"] = update_payload["title"].strip()
    if "description" in update_payload:
        update_payload["description"] = update_payload["description"].strip()
    if "goal" in update_payload and isinstance(update_payload["goal"], str):
        update_payload["goal"] = update_payload["goal"].strip()
    if "status" in update_payload and isinstance(update_payload["status"], str):
        update_payload["status"] = update_payload["status"].strip() or "active"
    update_payload["updated_at"] = datetime.now(timezone.utc).isoformat()

    updated = update_project_for_user(project_id, user_id, update_payload)
    if not updated:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Could not update project.",
        )
    return {"project": updated}


@router.delete("/{project_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_project(project_id: str, user_id: str = Depends(get_current_user_id)) -> None:
    existing = get_project_for_user(project_id, user_id)
    if not existing:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found.")
    delete_project_for_user(project_id, user_id)


# ---------------------------------------------------------------------------
# Project <-> Collection links
# ---------------------------------------------------------------------------


@router.get("/{project_id}/collections")
def list_project_collections(
    project_id: str,
    user_id: str = Depends(get_current_user_id),
) -> dict:
    collections = list_collections_for_project(project_id, user_id)
    return {"collections": collections}


@router.get("/{project_id}/primary-collection")
def get_project_primary_collection(
    project_id: str,
    user_id: str = Depends(get_current_user_id),
) -> dict:
    project = get_project_for_user(project_id, user_id)
    if not project:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found.")
    collection = get_primary_collection_for_project(project_id, user_id)
    return {"collection": collection}


@router.post("/{project_id}/collections", status_code=status.HTTP_201_CREATED)
def attach_project_collection(
    project_id: str,
    payload: ProjectCollectionAttachRequest,
    user_id: str = Depends(get_current_user_id),
) -> dict:
    link = attach_collection_to_project(
        project_id=project_id,
        collection_id=payload.collection_id,
        user_id=user_id,
        is_primary=payload.is_primary,
    )
    return {"link": link}


@router.delete(
    "/{project_id}/collections/{collection_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def detach_project_collection(
    project_id: str,
    collection_id: str,
    user_id: str = Depends(get_current_user_id),
) -> None:
    detach_collection_from_project(project_id, collection_id, user_id)
