"""MinIO client helper."""
import logging
from datetime import timedelta

from minio import Minio

from app.core.security import decrypt_value
from app.models_dbapi import DataSource

_log = logging.getLogger(__name__)


def get_minio_client(datasource: DataSource) -> Minio:
    endpoint = f"{datasource.host}:{datasource.port}"
    return Minio(
        endpoint,
        access_key=datasource.username,
        secret_key=decrypt_value(datasource.password),
        secure=datasource.use_ssl,
    )


def download_file(client: Minio, bucket: str, path: str, local_path: str) -> None:
    _log.info("MinIO download: %s/%s → %s", bucket, path, local_path)
    client.fget_object(bucket, path, local_path)


def upload_file(client: Minio, bucket: str, path: str, local_path: str) -> None:
    _log.info("MinIO upload: %s → %s/%s", local_path, bucket, path)
    if not client.bucket_exists(bucket):
        client.make_bucket(bucket)
    client.fput_object(bucket, path, local_path)


def presigned_url(client: Minio, bucket: str, path: str, expires_seconds: int) -> str:
    return client.presigned_get_object(bucket, path, expires=timedelta(seconds=expires_seconds))
