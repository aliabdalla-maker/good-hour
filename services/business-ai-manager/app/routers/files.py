"""Upload -> scan & validate -> extract -> review -> download/share. Uploaded files are never executed."""
import hashlib
import os
import uuid

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy import select

from ..config import get_settings
from ..deps import Ctx, ctx
from ..models import StoredFile, UsageRecord
from ..services.audit import audit
from ..services.usage import limits_for, month_usage

router = APIRouter(prefix="/files", tags=["files"])

ALLOWED = {
    "application/pdf": b"%PDF", "image/png": b"\x89PNG", "image/jpeg": b"\xff\xd8\xff",
    "text/plain": None, "text/csv": None,
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": b"PK",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": b"PK",
    "audio/mpeg": None, "audio/mp4": None, "video/mp4": None,
}


def _view(f: StoredFile) -> dict:
    return {"id": f.id, "filename": f.filename, "content_type": f.content_type, "size_bytes": f.size_bytes,
            "created_at": f.created_at.isoformat(), "has_text": bool(f.extracted_text)}


@router.post("", status_code=201)
async def upload(file: UploadFile = File(...), c: Ctx = Depends(ctx)):
    s = get_settings()
    ctype = (file.content_type or "").split(";")[0]
    if ctype not in ALLOWED:
        raise HTTPException(415, f"Unsupported file type {ctype}")
    data = await file.read(s.max_upload_mb * 1024 * 1024 + 1)
    if len(data) > s.max_upload_mb * 1024 * 1024:
        raise HTTPException(413, f"File larger than {s.max_upload_mb} MB")
    if not data:
        raise HTTPException(400, "Empty file")
    magic = ALLOWED[ctype]
    if magic and not data.startswith(magic):
        raise HTTPException(400, "File content does not match its declared type")
    if month_usage(c.db, c.business.id)["file_bytes"] + len(data) > limits_for(c.db, c.business.id)["file_bytes"]:
        raise HTTPException(402, "Monthly file storage allowance reached")
    text = None
    if ctype in ("text/plain", "text/csv"):
        text = data.decode("utf-8", errors="replace")[:200_000]
    key = f"{c.business.id}/{uuid.uuid4().hex}"
    path = os.path.join(s.storage_dir, key)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "wb") as fh:
        fh.write(data)
    safe_name = os.path.basename(file.filename or "upload")[:255]
    f = StoredFile(business_id=c.business.id, uploaded_by=c.user.id, filename=safe_name, content_type=ctype,
                   size_bytes=len(data), sha256=hashlib.sha256(data).hexdigest(), storage_key=key,
                   extracted_text=text)
    c.db.add(f)
    c.db.add(UsageRecord(business_id=c.business.id, user_id=c.user.id, kind="file_upload", bytes=len(data)))
    audit(c.db, "file.uploaded", c.business.id, c.user.id, file_id=f.id, size=len(data))
    c.db.commit()
    return _view(f)


@router.get("")
def list_files(c: Ctx = Depends(ctx)):
    rows = c.db.scalars(select(StoredFile).where(StoredFile.business_id == c.business.id)
                        .order_by(StoredFile.created_at.desc()).limit(200)).all()
    return [_view(f) for f in rows]


def _own(c: Ctx, fid: str) -> StoredFile:
    f = c.db.get(StoredFile, fid)
    if not f or f.business_id != c.business.id:
        raise HTTPException(404, "File not found")
    return f


@router.get("/{fid}/text")
def text(fid: str, c: Ctx = Depends(ctx)):
    f = _own(c, fid)
    return {"id": f.id, "text": f.extracted_text}


@router.get("/{fid}/download")
def download(fid: str, c: Ctx = Depends(ctx)):
    f = _own(c, fid)
    audit(c.db, "file.downloaded", c.business.id, c.user.id, file_id=fid)
    c.db.commit()
    return FileResponse(os.path.join(get_settings().storage_dir, f.storage_key), media_type=f.content_type,
                        filename=f.filename)
