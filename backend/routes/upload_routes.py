"""
Image Upload Routes - Uploads to AWS S3 with local fallback
"""
from fastapi import APIRouter, UploadFile, File, HTTPException, Depends
from fastapi.responses import FileResponse
from typing import List
from auth import get_current_user
from pathlib import Path
import uuid
import os
import logging

router = APIRouter()
logger = logging.getLogger(__name__)

UPLOAD_DIR = Path("/app/uploads")
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

ALLOWED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".gif", ".webp"}
MAX_FILE_SIZE = 10 * 1024 * 1024  # 10MB
MAX_FILES = 10


async def upload_to_s3(file_bytes: bytes, filename: str, content_type: str) -> str:
    """Upload file to S3 and return public URL"""
    import boto3
    from botocore.config import Config as BotoConfig

    bucket = os.environ.get("AWS_BUCKET_NAME")
    region = os.environ.get("AWS_REGION", "us-east-1")
    access_key = os.environ.get("AWS_ACCESS_KEY_ID")
    secret_key = os.environ.get("AWS_SECRET_ACCESS_KEY")

    if not all([bucket, access_key, secret_key]):
        raise ValueError("S3 credentials not configured")

    s3 = boto3.client(
        "s3",
        aws_access_key_id=access_key,
        aws_secret_access_key=secret_key,
        region_name=region,
        config=BotoConfig(signature_version="s3v4"),
    )

    key = f"critiquee/uploads/{uuid.uuid4().hex}/{filename}"
    s3.put_object(
        Bucket=bucket,
        Key=key,
        Body=file_bytes,
        ContentType=content_type,
    )

    return f"https://{bucket}.s3.{region}.amazonaws.com/{key}"


def save_locally(file_bytes: bytes, filename: str) -> str:
    """Save file locally and return API path"""
    file_path = UPLOAD_DIR / filename
    file_path.write_bytes(file_bytes)
    return f"/api/uploads/files/{filename}"


@router.post("/images")
async def upload_images(
    files: List[UploadFile] = File(...),
    current_user=Depends(get_current_user),
):
    """Upload one or more images to S3 (or local fallback). Returns list of URLs."""
    if len(files) > MAX_FILES:
        raise HTTPException(status_code=400, detail=f"Maximum {MAX_FILES} images allowed")

    uploaded_urls = []

    for file in files:
        ext = Path(file.filename).suffix.lower() if file.filename else ""
        if ext not in ALLOWED_EXTENSIONS:
            raise HTTPException(
                status_code=400,
                detail=f"File type '{ext}' not allowed. Allowed: {', '.join(ALLOWED_EXTENSIONS)}",
            )

        file_bytes = await file.read()

        if len(file_bytes) > MAX_FILE_SIZE:
            raise HTTPException(status_code=400, detail="File too large. Maximum size is 10MB")

        unique_name = f"{uuid.uuid4().hex}{ext}"

        try:
            url = await upload_to_s3(
                file_bytes, unique_name, file.content_type or "image/jpeg"
            )
            logger.info(f"Uploaded {unique_name} to S3")
        except Exception as e:
            logger.warning(f"S3 upload unavailable ({type(e).__name__}), saving locally")
            url = save_locally(file_bytes, unique_name)

        uploaded_urls.append(url)

    return {"urls": uploaded_urls, "count": len(uploaded_urls)}


@router.get("/files/{filename}")
async def get_uploaded_file(filename: str):
    """Serve a locally stored uploaded file"""
    # Security: reject path traversal
    if "/" in filename or "\\" in filename or ".." in filename:
        raise HTTPException(status_code=400, detail="Invalid filename")

    file_path = UPLOAD_DIR / filename
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="File not found")

    return FileResponse(str(file_path))
