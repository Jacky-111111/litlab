from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from ..services.supabase_service import (
    batch_add_papers_to_collection,
    batch_remove_papers_from_collection,
    create_collection_for_user,
    delete_collection_for_user,
    generate_unique_share_slug,
    get_collection_for_user,
    get_current_user_id,
    list_collections_for_user,
    list_papers_in_collection,
    list_shared_emails,
    replace_shared_emails,
    set_collection_share_slug,
    update_collection_for_user,
)

router = APIRouter(prefix="/collections", tags=["collections"])


Visibility = Literal["private", "selected", "public"]


def _share_url_path(slug: str | None) -> str | None:
    if not slug:
        return None
    return f"/shared-collection.html?slug={slug}"


def _sharing_response(collection: dict, emails: list[str]) -> dict:
    return {
        "visibility": collection.get("visibility"),
        "share_slug": collection.get("share_slug"),
        "share_url_path": _share_url_path(collection.get("share_slug")),
        "invited_emails": emails,
    }


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


class SharingUpdateRequest(BaseModel):
    visibility: Visibility | None = None
    invited_emails: list[str] | None = None


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


# ---------------------------------------------------------------------------
# Sharing settings (owner-only)
# ---------------------------------------------------------------------------


@router.get("/{collection_id}/sharing")
def get_collection_sharing(
    collection_id: str,
    user_id: str = Depends(get_current_user_id),
) -> dict:
    collection = get_collection_for_user(collection_id, user_id)
    if not collection:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Collection not found.")
    emails = list_shared_emails(collection_id)
    return _sharing_response(collection, emails)


@router.patch("/{collection_id}/sharing")
def update_collection_sharing(
    collection_id: str,
    payload: SharingUpdateRequest,
    user_id: str = Depends(get_current_user_id),
) -> dict:
    collection = get_collection_for_user(collection_id, user_id)
    if not collection:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Collection not found.")

    target_visibility = payload.visibility or collection.get("visibility") or "private"

    # Ensure a slug exists for shareable states; keep existing slug if we flip
    # back to private (harmless — just ignored until the owner flips again).
    current_slug = collection.get("share_slug")
    if target_visibility in ("selected", "public") and not current_slug:
        new_slug = generate_unique_share_slug()
        updated = set_collection_share_slug(collection_id, user_id, new_slug)
        if updated:
            collection = updated

    if payload.visibility and payload.visibility != collection.get("visibility"):
        updated = update_collection_for_user(
            collection_id, user_id, {"visibility": payload.visibility}
        )
        if updated:
            collection = updated

    if payload.invited_emails is not None:
        replace_shared_emails(collection_id, user_id, payload.invited_emails)

    emails = list_shared_emails(collection_id)
    return _sharing_response(collection, emails)


@router.post("/{collection_id}/sharing/regenerate-link")
def regenerate_collection_share_link(
    collection_id: str,
    user_id: str = Depends(get_current_user_id),
) -> dict:
    collection = get_collection_for_user(collection_id, user_id)
    if not collection:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Collection not found.")
    if collection.get("visibility") not in ("selected", "public"):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Switch the collection to 'selected' or 'public' before regenerating a link.",
        )
    new_slug = generate_unique_share_slug()
    updated = set_collection_share_slug(collection_id, user_id, new_slug)
    if not updated:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Could not update share link.",
        )
    emails = list_shared_emails(collection_id)
    return _sharing_response(updated, emails)
