from hashlib import sha256
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field, HttpUrl

try:
    from ..services.paper_reader_service import extract_paper_from_url
    from ..services.paper_search_service import search_papers
    from ..services.supabase_service import (
        add_paper_to_collection,
        batch_add_papers_to_collection,
        batch_remove_papers_from_collection,
        create_or_update_paper_for_user,
        create_signed_pdf_url,
        delete_paper_for_user,
        get_current_user_id,
        get_or_update_paper_note,
        get_paper_for_user,
        get_project_for_user,
        list_collection_ids_for_paper,
        list_papers_for_user,
        list_saved_papers,
        save_paper,
        upload_pdf_for_user,
        update_paper_nickname_for_user,
        update_paper_url_for_user,
    )
except ImportError:
    from services.paper_reader_service import extract_paper_from_url
    from services.paper_search_service import search_papers
    from services.supabase_service import (
        add_paper_to_collection,
        batch_add_papers_to_collection,
        batch_remove_papers_from_collection,
        create_or_update_paper_for_user,
        create_signed_pdf_url,
        delete_paper_for_user,
        get_current_user_id,
        get_or_update_paper_note,
        get_paper_for_user,
        get_project_for_user,
        list_collection_ids_for_paper,
        list_papers_for_user,
        list_saved_papers,
        save_paper,
        upload_pdf_for_user,
        update_paper_nickname_for_user,
        update_paper_url_for_user,
    )

router = APIRouter(tags=["papers"])


class SavePaperRequest(BaseModel):
    external_paper_id: str = ""
    source: str = Field(default="Manual", min_length=1)
    title: str = Field(min_length=1)
    nickname: str = ""
    authors: list[str] = Field(default_factory=list)
    year: int | None = None
    abstract: str = ""
    url: str = ""
    pdf_storage_path: str = ""
    content_hash: str = ""


class IngestPaperRequest(BaseModel):
    source: str = Field(default="Manual", min_length=1)
    external_paper_id: str = ""
    title: str = ""
    nickname: str = ""
    authors: list[str] = Field(default_factory=list)
    year: int | None = None
    abstract: str = ""
    url: str = ""
    content_hash: str = ""
    filename: str = "uploaded.pdf"
    pdf_base64: str = ""
    collection_ids: list[str] = Field(default_factory=list)


class BatchCollectionRequest(BaseModel):
    paper_ids: list[str] = Field(default_factory=list)


class PaperNoteRequest(BaseModel):
    content: str = ""


class PaperNicknameRequest(BaseModel):
    nickname: str = ""


class PaperUrlRequest(BaseModel):
    url: HttpUrl


@router.get("/papers/search")
def search_papers_endpoint(q: str = Query(default="", min_length=0)) -> dict[str, list[dict[str, Any]]]:
    papers = search_papers(q)
    return {"papers": papers}


@router.post("/papers/ingest", status_code=status.HTTP_201_CREATED)
def ingest_paper(payload: IngestPaperRequest, user_id: str = Depends(get_current_user_id)) -> dict:
    working_payload = payload.model_dump()

    url = working_payload.get("url", "").strip()
    if url and not working_payload.get("title"):
        extracted = extract_paper_from_url(url)
        for key in ("title", "authors", "year", "abstract", "source"):
            if not working_payload.get(key):
                working_payload[key] = extracted.get(key)

    pdf_base64 = (working_payload.get("pdf_base64") or "").strip()
    if pdf_base64:
        try:
            import base64

            pdf_bytes = base64.b64decode(pdf_base64, validate=True)
        except Exception as exc:  # noqa: BLE001
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid PDF payload. Could not decode base64 data.",
            ) from exc
        if len(pdf_bytes) > 20 * 1024 * 1024:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="PDF too large. Please upload a file under 20MB.",
            )
        content_hash = working_payload.get("content_hash", "").strip() or sha256(pdf_bytes).hexdigest()
        pdf_storage_path = upload_pdf_for_user(
            user_id=user_id,
            filename=working_payload.get("filename", "uploaded.pdf"),
            pdf_bytes=pdf_bytes,
            content_hash=content_hash,
        )
        working_payload["content_hash"] = content_hash
        working_payload["pdf_storage_path"] = pdf_storage_path

    if not working_payload.get("title", "").strip():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Paper title is required.")

    paper = create_or_update_paper_for_user(user_id=user_id, payload=working_payload)
    for collection_id in payload.collection_ids:
        add_paper_to_collection(collection_id, paper["id"], user_id)
    return {"paper": paper}


@router.get("/papers")
def list_library_papers(
    q: str = Query(default="", min_length=0),
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    user_id: str = Depends(get_current_user_id),
) -> dict:
    return {"papers": list_papers_for_user(user_id=user_id, query=q, limit=limit, offset=offset)}


@router.get("/papers/{paper_id}")
def get_library_paper(paper_id: str, user_id: str = Depends(get_current_user_id)) -> dict:
    paper = get_paper_for_user(paper_id, user_id)
    if not paper:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Paper not found.")
    note = get_or_update_paper_note(paper_id, user_id)
    collection_ids = list_collection_ids_for_paper(paper_id, user_id)
    return {"paper": paper, "note": note, "collection_ids": collection_ids}


@router.delete("/papers/{paper_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_library_paper(paper_id: str, user_id: str = Depends(get_current_user_id)) -> None:
    deleted = delete_paper_for_user(paper_id, user_id)
    if not deleted:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Paper not found.")


@router.put("/papers/{paper_id}/note")
def put_paper_note(paper_id: str, payload: PaperNoteRequest, user_id: str = Depends(get_current_user_id)) -> dict:
    paper = get_paper_for_user(paper_id, user_id)
    if not paper:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Paper not found.")
    note = get_or_update_paper_note(paper_id, user_id, content=payload.content)
    return {"note": note}


@router.put("/papers/{paper_id}/nickname")
def put_paper_nickname(
    paper_id: str,
    payload: PaperNicknameRequest,
    user_id: str = Depends(get_current_user_id),
) -> dict:
    paper = update_paper_nickname_for_user(paper_id, user_id, payload.nickname)
    if not paper:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Paper not found.")
    return {"paper": paper}


@router.put("/papers/{paper_id}/url")
def put_paper_url(
    paper_id: str,
    payload: PaperUrlRequest,
    user_id: str = Depends(get_current_user_id),
) -> dict:
    paper = update_paper_url_for_user(paper_id, user_id, str(payload.url))
    if not paper:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Paper not found.")
    return {"paper": paper}


@router.get("/papers/{paper_id}/pdf-download-url")
def get_paper_pdf_download_url(paper_id: str, user_id: str = Depends(get_current_user_id)) -> dict:
    paper = get_paper_for_user(paper_id, user_id)
    if not paper:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Paper not found.")
    pdf_storage_path = str(paper.get("pdf_storage_path") or "").strip()
    if not pdf_storage_path:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No PDF file saved for this paper.")
    signed_url = create_signed_pdf_url(pdf_storage_path, expires_in_seconds=3600)
    if not signed_url:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="Could not generate PDF download URL.")
    return {"download_url": signed_url, "expires_in_seconds": 3600}


@router.post("/collections/{collection_id}/papers:batchAdd")
def batch_add_collection_papers(
    collection_id: str,
    payload: BatchCollectionRequest,
    user_id: str = Depends(get_current_user_id),
) -> dict:
    added = batch_add_papers_to_collection(collection_id, payload.paper_ids, user_id)
    return {"added": added}


@router.post("/collections/{collection_id}/papers:batchRemove")
def batch_remove_collection_papers(
    collection_id: str,
    payload: BatchCollectionRequest,
    user_id: str = Depends(get_current_user_id),
) -> dict:
    removed = batch_remove_papers_from_collection(collection_id, payload.paper_ids, user_id)
    return {"removed": removed}


@router.get("/collections/{collection_id}/papers")
def list_collection_papers(collection_id: str, user_id: str = Depends(get_current_user_id)) -> dict:
    project = get_project_for_user(collection_id, user_id)
    if not project:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Collection not found.")
    return {"papers": list_saved_papers(collection_id)}


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

    paper = save_paper(project_id, payload.model_dump(), user_id=user_id)
    return {"paper": paper}
