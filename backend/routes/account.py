from datetime import datetime, timezone

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from ..services.supabase_service import (
    get_current_user,
    get_user_profile,
    upsert_user_profile,
)

router = APIRouter(prefix="/account", tags=["account"])


class AccountProfileUpdateRequest(BaseModel):
    nickname: str = Field(default="", max_length=80)
    school: str = Field(default="", max_length=140)


@router.get("/profile")
def get_profile(user: dict[str, str] = Depends(get_current_user)) -> dict:
    user_id = user["id"]
    email = user["email"]
    profile = get_user_profile(user_id) or {}
    return {
        "profile": {
            "user_id": user_id,
            "email": email,
            "nickname": profile.get("nickname", ""),
            "school": profile.get("school", ""),
            "public_handle": profile.get("public_handle", ""),
        }
    }


@router.put("/profile")
def update_profile(payload: AccountProfileUpdateRequest, user: dict[str, str] = Depends(get_current_user)) -> dict:
    user_id = user["id"]
    email = user["email"]
    now_iso = datetime.now(timezone.utc).isoformat()
    existing = get_user_profile(user_id) or {}
    profile = upsert_user_profile(
        user_id=user_id,
        payload={
            "nickname": payload.nickname.strip(),
            "school": payload.school.strip(),
            "email": email,
            "created_at": existing.get("created_at", now_iso),
            "updated_at": now_iso,
        },
    )
    return {
        "profile": {
            "user_id": user_id,
            "email": email,
            "nickname": profile.get("nickname", ""),
            "school": profile.get("school", ""),
            "public_handle": profile.get("public_handle", ""),
        }
    }
