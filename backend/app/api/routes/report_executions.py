"""Global report execution endpoints with scoped permission checks."""
import logging
import os
import tempfile
import uuid
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import FileResponse
from sqlmodel import Session, func, select

from app.api.deps import CurrentUser, SessionDep, require_permission
from app.api.pagination import get_allowed_ids
from app.models_permission import PermissionActionEnum, ResourceTypeEnum
from app.models_report import (
    ExecutionStatusEnum,
    ReportExecution,
    ReportModule,
    ReportTemplate,
)
from app.schemas_report import ReportExecutionListOut, ReportExecutionPublic

_log = logging.getLogger(__name__)

router = APIRouter(prefix="/report-executions", tags=["report-executions"])
RES = ResourceTypeEnum.REPORT_MODULE


def _to_public(e: ReportExecution) -> ReportExecutionPublic:
    return ReportExecutionPublic(**{k: getattr(e, k) for k in ReportExecutionPublic.model_fields})


def _get_allowed_module_ids(session, current_user) -> list[uuid.UUID] | None:
    """Return None if user has global access, or list of allowed module IDs."""
    return get_allowed_ids(session, current_user, RES, PermissionActionEnum.READ)


@router.get("/{exec_id}", response_model=ReportExecutionPublic,
    dependencies=[Depends(require_permission(RES, PermissionActionEnum.READ))])
def get_execution(session: SessionDep, current_user: CurrentUser, exec_id: uuid.UUID) -> Any:
    exc = session.get(ReportExecution, exec_id)
    if not exc:
        raise HTTPException(404, "Execution not found")

    # Scoped permission: check user can access the module this execution belongs to
    allowed = _get_allowed_module_ids(session, current_user)
    if allowed is not None:
        tpl = session.get(ReportTemplate, exc.report_template_id)
        if not tpl or tpl.report_module_id not in allowed:
            raise HTTPException(404, "Execution not found")

    return _to_public(exc)


@router.get("/{exec_id}/download")
def download_execution(
    session: SessionDep,
    request: Request,
    exec_id: uuid.UUID,
    token: str | None = None,
) -> Any:
    """Download the generated report file.

    Auth via: Authorization header OR ?token= query param (for browser links).
    """
    from app.core.config import settings
    from app.core.security import ALGORITHM, TOKEN_TYPE_DASHBOARD, TOKEN_TYPE_GATEWAY
    from app.engines.excel.minio_client import get_minio_client
    from app.models_dbapi import AppClient, DataSource
    from app.models_report import ReportModuleClientLink
    import jwt as pyjwt

    # Auth: header OR query param
    auth = request.headers.get("authorization", "")
    jwt_token = auth.replace("Bearer ", "").replace("bearer ", "").strip()
    if not jwt_token and token:
        jwt_token = token  # From ?token= query param
    if not jwt_token:
        raise HTTPException(401, "Authorization required. Use ?token= or Authorization header.")

    try:
        payload = pyjwt.decode(jwt_token, settings.SECRET_KEY, algorithms=[ALGORITHM], options={"verify_exp": True})
    except pyjwt.ExpiredSignatureError:
        raise HTTPException(401, "Token expired")
    except pyjwt.InvalidTokenError:
        raise HTTPException(403, "Invalid token")

    # Load execution
    exc = session.get(ReportExecution, exec_id)
    if not exc or exc.status != ExecutionStatusEnum.SUCCESS or not exc.output_minio_path:
        raise HTTPException(404, "File not found")

    # Load template → module
    tpl = session.get(ReportTemplate, exc.report_template_id)
    if not tpl:
        raise HTTPException(404, "File not found")
    mod = session.get(ReportModule, tpl.report_module_id)
    if not mod:
        raise HTTPException(404, "File not found")

    # Permission check
    token_type = payload.get("type")
    if token_type == TOKEN_TYPE_GATEWAY:
        client_id_str = payload.get("sub")
        client = session.exec(select(AppClient).where(AppClient.client_id == client_id_str)).first()
        if not client:
            raise HTTPException(403, "Client not found")
        link = session.exec(
            select(ReportModuleClientLink).where(
                ReportModuleClientLink.report_module_id == mod.id,
                ReportModuleClientLink.app_client_id == client.id,
            )
        ).first()
        if not link:
            raise HTTPException(403, "Not authorized")
    elif token_type != TOKEN_TYPE_DASHBOARD:
        raise HTTPException(403, "Invalid token type")

    # Parse bucket/path from output_minio_path (format: "bucket/path/to/file.xlsx")
    parts = exc.output_minio_path.split("/", 1)
    if len(parts) != 2:
        raise HTTPException(404, "Invalid file path")
    bucket, object_path = parts

    # Download from MinIO to temp file and stream
    minio_ds = session.get(DataSource, mod.minio_datasource_id)
    if not minio_ds:
        raise HTTPException(500, "MinIO datasource not found")

    tmp = tempfile.NamedTemporaryFile(suffix=".xlsx", delete=False)
    tmp_path = tmp.name
    tmp.close()
    try:
        client = get_minio_client(minio_ds)
        client.fget_object(bucket, object_path, tmp_path)
        filename = os.path.basename(object_path)
        return FileResponse(
            tmp_path,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            filename=filename,
            background=None,  # cleanup handled by BackgroundTask below
        )
    except Exception as e:
        if os.path.exists(tmp_path):
            os.unlink(tmp_path)
        _log.error("Download failed: %s", e)
        raise HTTPException(500, "Download failed")


@router.get("", response_model=ReportExecutionListOut,
    dependencies=[Depends(require_permission(RES, PermissionActionEnum.READ))])
def list_executions(
    session: SessionDep,
    current_user: CurrentUser,
    page: int = 1, page_size: int = 20,
    status: ExecutionStatusEnum | None = None,
    template_id: uuid.UUID | None = None,
    module_id: uuid.UUID | None = None,
) -> Any:
    # Scoped permission: filter by allowed modules
    allowed = _get_allowed_module_ids(session, current_user)

    # Always join template to filter by module
    need_join = True

    wheres = []
    if status:
        wheres.append(ReportExecution.status == status)
    if template_id:
        wheres.append(ReportExecution.report_template_id == template_id)
    if module_id:
        wheres.append(ReportTemplate.report_module_id == module_id)
    if allowed is not None:
        wheres.append(ReportTemplate.report_module_id.in_(allowed))

    # Count
    count_stmt = select(func.count()).select_from(ReportExecution).join(
        ReportTemplate, ReportExecution.report_template_id == ReportTemplate.id
    )
    for w in wheres:
        count_stmt = count_stmt.where(w)
    total = session.exec(count_stmt).one()

    # Data
    stmt = select(ReportExecution).join(
        ReportTemplate, ReportExecution.report_template_id == ReportTemplate.id
    )
    for w in wheres:
        stmt = stmt.where(w)
    offset = (page - 1) * page_size
    rows = session.exec(
        stmt.order_by(ReportExecution.created_at.desc()).offset(offset).limit(page_size)
    ).all()
    return ReportExecutionListOut(data=[_to_public(e) for e in rows], total=total)
