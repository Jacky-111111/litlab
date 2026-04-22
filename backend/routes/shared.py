from fastapi import APIRouter, Depends

try:
    from ..services.supabase_service import (
        get_collection_by_slug,
        get_optional_user,
        get_sharer_public_profile,
        list_papers_in_collection,
        list_shared_emails,
        mark_invited_user_id,
    )
except ImportError:
    from services.supabase_service import (
        get_collection_by_slug,
        get_optional_user,
        get_sharer_public_profile,
        list_papers_in_collection,
        list_shared_emails,
        mark_invited_user_id,
    )


router = APIRouter(prefix="/shared", tags=["shared"])


def _denied(reason: str) -> dict:
    return {"access": "denied", "reason": reason}


@router.get("/c/{share_slug}")
def get_shared_collection(
    share_slug: str,
    user: dict | None = Depends(get_optional_user),
) -> dict:
    """Resolve a collection by its share slug and enforce access rules.

    Returns a 200 with an access envelope in every case so the frontend
    does not hit the global 401-auto-logout path in apiFetch.
    """
    collection = get_collection_by_slug(share_slug)
    if not collection:
        return _denied("not_found")

    visibility = collection.get("visibility") or "private"
    owner_id = collection.get("owner_user_id")
    viewer_id = user["id"] if user else None
    viewer_email = (user["email"] if user else "") or ""
    is_owner = bool(viewer_id and viewer_id == owner_id)

    if visibility == "private" and not is_owner:
        return _denied("private")

    if visibility == "selected" and not is_owner:
        if not user:
            return _denied("sign_in_required")
        normalized_email = viewer_email.strip().lower()
        invited = list_shared_emails(collection["id"])
        if normalized_email not in invited:
            return _denied("not_authorized")
        mark_invited_user_id(collection["id"], normalized_email, viewer_id)

    papers = list_papers_in_collection(collection["id"])
    sharer = get_sharer_public_profile(owner_id) if owner_id else {}

    return {
        "access": "granted",
        "collection": {
            "id": collection.get("id"),
            "title": collection.get("title"),
            "description": collection.get("description"),
            "visibility": visibility,
            "share_slug": collection.get("share_slug"),
            "updated_at": collection.get("updated_at"),
        },
        "papers": papers,
        "sharer": sharer,
        "viewer": {
            "is_owner": is_owner,
            "is_authenticated": user is not None,
        },
    }
