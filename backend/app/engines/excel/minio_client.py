"""MinIO client helper."""
import logging
import os
from datetime import timedelta

from minio import Minio

from app.core.security import decrypt_value
from app.models_dbapi import DataSource

_log = logging.getLogger(__name__)


def get_minio_client(datasource: DataSource, decrypt: bool = True) -> Minio:
    endpoint = f"{datasource.host}:{datasource.port}"
    password = datasource.password or ""
    secret_key = decrypt_value(password) if decrypt else password
    return Minio(
        endpoint,
        access_key=datasource.username,
        secret_key=secret_key,
        secure=datasource.use_ssl,
    )


def download_file(
    client: Minio, bucket: str, path: str, local_path: str,
    max_size_bytes: int | None = None,
) -> None:
    """Download object to local_path. Rejects objects larger than max_size_bytes
    before transferring any bytes (stat_object is a cheap HEAD)."""
    if max_size_bytes is not None and max_size_bytes > 0:
        stat = client.stat_object(bucket, path)
        if stat.size is not None and stat.size > max_size_bytes:
            raise ValueError(
                f"Template file too large: {stat.size} bytes "
                f"(limit {max_size_bytes} bytes)"
            )
    _log.info("MinIO download: %s/%s → %s", bucket, path, local_path)
    client.fget_object(bucket, path, local_path)


def upload_file(
    client: Minio, bucket: str, path: str, local_path: str,
    max_size_bytes: int | None = None,
) -> None:
    """Upload local_path to object storage. Rejects files larger than max_size_bytes."""
    if max_size_bytes is not None and max_size_bytes > 0:
        size = os.path.getsize(local_path)
        if size > max_size_bytes:
            raise ValueError(
                f"Output file too large: {size} bytes "
                f"(limit {max_size_bytes} bytes)"
            )
    _log.info("MinIO upload: %s → %s/%s", local_path, bucket, path)
    if not client.bucket_exists(bucket):
        client.make_bucket(bucket)
    client.fput_object(bucket, path, local_path)


def presigned_url(client: Minio, bucket: str, path: str, expires_seconds: int) -> str:
    return client.presigned_get_object(bucket, path, expires=timedelta(seconds=expires_seconds))
