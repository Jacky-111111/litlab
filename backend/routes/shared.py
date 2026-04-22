import io
import os
from urllib.parse import urlparse

import qrcode
from fastapi import APIRouter, Depends, HTTPException, Query, Response, status

try:
    from ..services.supabase_service import (
        get_collection_by_slug,
        get_collection_for_user,
        get_current_user_id,
        get_optional_user,
        get_sharer_public_profile,
        list_papers_in_collection,
        list_shared_emails,
        mark_invited_user_id,
    )
except ImportError:
    from services.supabase_service import (
        get_collection_by_slug,
        get_collection_for_user,
        get_current_user_id,
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


# ---------------------------------------------------------------------------
# Shared-link QR code (owner-only)
# ---------------------------------------------------------------------------

# Where the generated QR should point. Priority:
#   1. ?origin=... query parameter (useful in dev where frontend host varies)
#   2. FRONTEND_ORIGIN env var
# We then append `/shared-collection.html?slug=<slug>` to build the absolute
# URL embedded in the QR image.
def _resolve_frontend_origin(origin_override: str | None) -> str:
    candidate = (origin_override or os.getenv("FRONTEND_ORIGIN") or "").strip()
    if not candidate:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                "Cannot build a share URL: set FRONTEND_ORIGIN on the server "
                "or pass ?origin=https://your-frontend to this endpoint."
            ),
        )
    parsed = urlparse(candidate)
    if parsed.scheme not in ("http", "https") or not parsed.netloc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="origin must be an absolute http(s) URL.",
        )
    return f"{parsed.scheme}://{parsed.netloc}"


@router.get("/c/{share_slug}/qr.png")
def get_shared_collection_qr(
    share_slug: str,
    size: int = Query(default=512, ge=128, le=1024),
    download: bool = Query(default=False),
    origin: str | None = Query(default=None),
    user_id: str = Depends(get_current_user_id),
) -> Response:
    """Render a PNG QR code for a collection's share link.

    Owner-only. The encoded URL points to the public shared-collection page;
    permission checks still happen when a scanner actually opens the link
    (`GET /shared/c/{slug}`), so this endpoint does not leak anything a
    shareable collection would not already leak via its slug.
    """
    collection = get_collection_by_slug(share_slug)
    if not collection:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found.")

    # Owner-only: re-fetch with ownership check so RLS semantics stay obvious.
    owned = get_collection_for_user(collection["id"], user_id)
    if not owned:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found.")

    if (owned.get("visibility") or "private") not in ("selected", "public"):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="QR codes are only available for 'selected' or 'public' collections.",
        )

    frontend_origin = _resolve_frontend_origin(origin)
    share_url = f"{frontend_origin}/shared-collection.html?slug={share_slug}"

    # qrcode box_size roughly controls module pixel size. QR v4 at EC level M
    # has a 33x33 grid; we want the final image edge around `size` pixels.
    box_size = max(4, size // 33)
    qr = qrcode.QRCode(
        version=None,
        error_correction=qrcode.constants.ERROR_CORRECT_M,
        box_size=box_size,
        border=2,
    )
    qr.add_data(share_url)
    qr.make(fit=True)
    # LitLab-black foreground on pure white background — maximum scannability
    # while staying on-brand with our text color (#131722).
    img = qr.make_image(fill_color="#131722", back_color="#ffffff")

    buf = io.BytesIO()
    img.save(buf, format="PNG")
    png_bytes = buf.getvalue()

    headers = {
        # QR rendering is deterministic given (slug, size, origin). Cache at
        # the edge for a day; owners regenerating the slug invalidates the
        # URL anyway because the slug changes.
        "Cache-Control": "public, max-age=86400",
    }
    if download:
        headers["Content-Disposition"] = (
            f'attachment; filename="litlab-collection-{share_slug}.png"'
        )

    return Response(content=png_bytes, media_type="image/png", headers=headers)
