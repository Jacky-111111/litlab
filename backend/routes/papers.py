from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field

from services.paper_search_service import search_papers
from services.supabase_service import (
    get_current_user_id,
    get_project_for_user,
    list_saved_papers,
    save_paper,
)

router = APIRouter(tags=["papers"])


class SavePaperRequest(BaseModel):
    external_paper_id: str = Field(min_length=1)
    source: str = Field(min_length=1)
    title: str = Field(min_length=1)
    authors: list[str] = Field(default_factory=list)
    year: int | None = None
    abstract: str = ""
    url: str = ""


@router.get("/papers/search")
def search_papers_endpoint(q: str = Query(default="", min_length=0)) -> dict[str, list[dict[str, Any]]]:
    papers = search_papers(q)
    return {"papers": papers}


@router.get("/projects/{project_id}/papers")
def list_saved_project_papers(project_id: str, user_id: str = Depends(get_current_user_id)) -> dict:
    project = get_project_for_user(project_id, user_id)
    if not project:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found.")
    return {"papers": list_saved_papers(project_id)}


@router.post("/projects/{project_id}/papers", status_code=status.HTTP_201_CREATED)
def save_paper_to_project(
    project_id: str,
    payload: SavePaperRequest,
    user_id: str = Depends(get_current_user_id),
) -> dict:
    project = get_project_for_user(project_id, user_id)
    if not project:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found.")

    paper = save_paper(project_id, payload.model_dump())
    return {"paper": paper}
