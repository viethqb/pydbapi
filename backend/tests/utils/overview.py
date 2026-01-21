"""Test helpers for Overview (AccessRecord, VersionCommit)."""

import uuid

from sqlmodel import Session

from app.models_dbapi import AccessRecord, VersionCommit
from tests.utils.utils import random_lower_string


def create_random_access_record(
    db: Session,
    *,
    api_assignment_id: uuid.UUID | None = None,
    app_client_id: uuid.UUID | None = None,
    ip_address: str = "127.0.0.1",
    http_method: str = "GET",
    path: str | None = None,
    status_code: int = 200,
    request_body: str | None = None,
) -> AccessRecord:
    """Create an AccessRecord in the DB."""
    r = AccessRecord(
        api_assignment_id=api_assignment_id,
        app_client_id=app_client_id,
        ip_address=ip_address,
        http_method=http_method,
        path=path or f"/api/{random_lower_string()[:8]}",
        status_code=status_code,
        request_body=request_body,
    )
    db.add(r)
    db.commit()
    db.refresh(r)
    return r


def create_random_version_commit(
    db: Session,
    *,
    api_assignment_id: uuid.UUID,
    content_snapshot: str | None = None,
    version: int = 1,
    commit_message: str | None = None,
) -> VersionCommit:
    """Create a VersionCommit in the DB. Requires api_assignment_id."""
    v = VersionCommit(
        api_assignment_id=api_assignment_id,
        content_snapshot=content_snapshot or "SELECT 1",
        version=version,
        commit_message=commit_message or f"commit-{random_lower_string()[:8]}",
    )
    db.add(v)
    db.commit()
    db.refresh(v)
    return v
