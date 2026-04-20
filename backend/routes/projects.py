from datetime import datetime, timezone
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

try:
    from ..services.supabase_service import (
        create_project_for_user,
        delete_project_for_user,
        get_current_user_id,
        get_project_for_user,
        list_projects_for_user,
        update_project_for_user,
    )
    from ..utils.framework_guidance import get_framework_guidance
except ImportError:
    from services.supabase_service import (
        create_project_for_user,
        delete_project_for_user,
        get_current_user_id,
        get_project_for_user,
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


class ProjectUpdateRequest(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=200)
    description: str | None = Field(default=None, max_length=4000)
    framework_type: FrameworkType | None = None


@router.get("")
def list_projects(user_id: str = Depends(get_current_user_id)) -> dict:
    return {"projects": list_projects_for_user(user_id)}


@router.post("", status_code=status.HTTP_201_CREATED)
def create_project(payload: ProjectCreateRequest, user_id: str = Depends(get_current_user_id)) -> dict:
    now_iso = datetime.now(timezone.utc).isoformat()
    project = create_project_for_user(
        user_id=user_id,
        payload={
            "title": payload.title.strip(),
            "description": payload.description.strip(),
            "framework_type": payload.framework_type,
            "created_at": now_iso,
            "updated_at": now_iso,
        },
    )
    return {"project": project}


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
