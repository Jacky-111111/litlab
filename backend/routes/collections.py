from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

try:
    from ..services.supabase_service import (
        batch_add_papers_to_collection,
        batch_remove_papers_from_collection,
        create_collection_for_user,
        delete_collection_for_user,
        get_collection_for_user,
        get_current_user_id,
        list_collections_for_user,
        list_papers_in_collection,
        update_collection_for_user,
    )
except ImportError:
    from services.supabase_service import (
        batch_add_papers_to_collection,
        batch_remove_papers_from_collection,
        create_collection_for_user,
        delete_collection_for_user,
        get_collection_for_user,
        get_current_user_id,
        list_collections_for_user,
        list_papers_in_collection,
        update_collection_for_user,
    )

router = APIRouter(prefix="/collections", tags=["collections"])


Visibility = Literal["private", "link", "public"]


class CollectionCreateRequest(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    description: str = Field(default="", max_length=4000)
    visibility: Visibility = "private"


class CollectionUpdateRequest(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=200)
    description: str | None = Field(default=None, max_length=4000)
    visibility: Visibility | None = None
    share_slug: str | None = Field(default=None, max_length=128)


class BatchCollectionRequest(BaseModel):
    paper_ids: list[str] = Field(default_factory=list)


@router.get("")
def list_collections(user_id: str = Depends(get_current_user_id)) -> dict:
    return {"collections": list_collections_for_user(user_id)}


@router.post("", status_code=status.HTTP_201_CREATED)
def create_collection(
    payload: CollectionCreateRequest,
    user_id: str = Depends(get_current_user_id),
) -> dict:
    collection = create_collection_for_user(
        user_id,
        {
            "title": payload.title.strip(),
            "description": payload.description.strip(),
            "visibility": payload.visibility,
        },
    )
    return {"collection": collection}


@router.get("/{collection_id}")
def get_collection(collection_id: str, user_id: str = Depends(get_current_user_id)) -> dict:
    collection = get_collection_for_user(collection_id, user_id)
    if not collection:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Collection not found.")
    return {"collection": collection}


@router.put("/{collection_id}")
def update_collection(
    collection_id: str,
    payload: CollectionUpdateRequest,
    user_id: str = Depends(get_current_user_id),
) -> dict:
    existing = get_collection_for_user(collection_id, user_id)
    if not existing:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Collection not found.")
    update_payload = payload.model_dump(exclude_none=True)
    if "title" in update_payload:
        update_payload["title"] = update_payload["title"].strip()
    if "description" in update_payload:
        update_payload["description"] = update_payload["description"].strip()
    if "share_slug" in update_payload and isinstance(update_payload["share_slug"], str):
        update_payload["share_slug"] = update_payload["share_slug"].strip()
    updated = update_collection_for_user(collection_id, user_id, update_payload)
    if not updated:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Could not update collection.",
        )
    return {"collection": updated}


@router.delete("/{collection_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_collection(collection_id: str, user_id: str = Depends(get_current_user_id)) -> None:
    existing = get_collection_for_user(collection_id, user_id)
    if not existing:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Collection not found.")
    delete_collection_for_user(collection_id, user_id)


@router.get("/{collection_id}/papers")
def list_collection_papers(
    collection_id: str,
    user_id: str = Depends(get_current_user_id),
) -> dict:
    collection = get_collection_for_user(collection_id, user_id)
    if not collection:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Collection not found.")
    return {"papers": list_papers_in_collection(collection_id)}


@router.post("/{collection_id}/papers:batchAdd")
def batch_add_collection_papers(
    collection_id: str,
    payload: BatchCollectionRequest,
    user_id: str = Depends(get_current_user_id),
) -> dict:
    added = batch_add_papers_to_collection(collection_id, payload.paper_ids, user_id)
    return {"added": added}


@router.post("/{collection_id}/papers:batchRemove")
def batch_remove_collection_papers(
    collection_id: str,
    payload: BatchCollectionRequest,
    user_id: str = Depends(get_current_user_id),
) -> dict:
    removed = batch_remove_papers_from_collection(collection_id, payload.paper_ids, user_id)
    return {"removed": removed}
