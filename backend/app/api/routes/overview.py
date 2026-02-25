"""
Overview / Dashboard (Phase 2, Task 2.7).

Endpoints: stats, recent-access, recent-commits.
"""

from datetime import date, datetime, timedelta, timezone

from fastapi import APIRouter, Depends
from sqlmodel import func, select

from app.api.deps import CurrentUser, SessionDep, require_permission
from app.core.access_log_storage import get_log_engine_for_reading
from app.core.starrocks_audit import (
    read_starrocks_audit_recent,
    read_starrocks_audit_requests_by_day,
    read_starrocks_audit_top_paths,
)
from app.models_permission import PermissionActionEnum, ResourceTypeEnum
from app.models import User
from app.models_dbapi import (
    AccessRecord,
    ApiAssignment,
    ApiGroup,
    ApiModule,
    AppClient,
    DataSource,
    VersionCommit,
)
from sqlmodel import Session as SMSession
from app.schemas_dbapi import (
    AccessRecordPublic,
    OverviewStats,
    RecentAccessOut,
    RecentCommitsOut,
    RequestsByDayOut,
    RequestsByDayPoint,
    TopPathPoint,
    TopPathsOut,
    VersionCommitPublic,
)

router = APIRouter(prefix="/overview", tags=["overview"])

# Default limit for recent-access and recent-commits
RECENT_LIMIT = 20
CHART_DAYS_DEFAULT = 14


def _count(session, model, where=None):
    """Count rows in model; optional where clause."""
    stmt = select(func.count()).select_from(model)
    if where is not None:
        stmt = stmt.where(where)
    return session.exec(stmt).one() or 0


@router.get(
    "/stats",
    response_model=OverviewStats,
    dependencies=[
        Depends(
            require_permission(ResourceTypeEnum.OVERVIEW, PermissionActionEnum.READ)
        )
    ],
)
def get_overview_stats(
    session: SessionDep,
    current_user: CurrentUser,  # noqa: ARG001
) -> OverviewStats:
    """Counts: datasources, modules, groups, apis (published/total), clients."""
    return OverviewStats(
        datasources=_count(session, DataSource),
        modules=_count(session, ApiModule),
        groups=_count(session, ApiGroup),
        apis_total=_count(session, ApiAssignment),
        apis_published=_count(
            session, ApiAssignment, ApiAssignment.is_published == True
        ),
        clients=_count(session, AppClient),
    )


@router.get(
    "/requests-by-day",
    response_model=RequestsByDayOut,
    dependencies=[
        Depends(
            require_permission(ResourceTypeEnum.OVERVIEW, PermissionActionEnum.READ)
        )
    ],
)
def get_requests_by_day(
    session: SessionDep,
    current_user: CurrentUser,  # noqa: ARG001
    days: int = CHART_DAYS_DEFAULT,
) -> RequestsByDayOut:
    """Requests grouped by day from AccessRecord.created_at. Uses external DB if configured."""
    days = max(1, min(365, days))
    engine, use_main, use_starrocks_audit = get_log_engine_for_reading(session)

    if use_starrocks_audit and engine is not None:
        points_raw = read_starrocks_audit_requests_by_day(engine, days=days)
        points = [RequestsByDayPoint(day=d, count=c) for d, c in points_raw]
        return RequestsByDayOut(data=points)

    log_session = session if use_main else SMSession(engine)
    try:
        cutoff = datetime.now(timezone.utc) - timedelta(days=days)
        day_expr = func.date(AccessRecord.created_at).label("day")
        count_expr = func.count().label("count")
        stmt = (
            select(day_expr, count_expr)
            .where(AccessRecord.created_at >= cutoff)
            .group_by(day_expr)
            .order_by(day_expr.asc())
        )
        rows = log_session.exec(stmt).all()

        points: list[RequestsByDayPoint] = []
        for day_value, count_value in rows:
            if isinstance(day_value, datetime):
                day_value = day_value.date()
            elif isinstance(day_value, str):
                # SQLite returns YYYY-MM-DD strings for date(...)
                day_value = date.fromisoformat(day_value.split("T")[0])
            points.append(RequestsByDayPoint(day=day_value, count=int(count_value or 0)))

        return RequestsByDayOut(data=points)
    finally:
        if log_session is not None and log_session is not session:
            log_session.close()


@router.get(
    "/top-paths",
    response_model=TopPathsOut,
    dependencies=[
        Depends(
            require_permission(ResourceTypeEnum.OVERVIEW, PermissionActionEnum.READ)
        )
    ],
)
def get_top_paths(
    session: SessionDep,
    current_user: CurrentUser,  # noqa: ARG001
    days: int = 7,
    limit: int = 10,
) -> TopPathsOut:
    """Top accessed paths within the last N days. Uses external DB if configured."""
    days = max(1, min(365, days))
    limit = max(1, min(100, limit))
    engine, use_main, use_starrocks_audit = get_log_engine_for_reading(session)

    if use_starrocks_audit and engine is not None:
        points_raw = read_starrocks_audit_top_paths(engine, days=days, limit=limit)
        points = [TopPathPoint(path=p, count=c) for p, c in points_raw]
        return TopPathsOut(data=points)

    log_session = session if use_main else SMSession(engine)
    try:
        cutoff = datetime.now(timezone.utc) - timedelta(days=days)
        count_expr = func.count().label("count")
        stmt = (
            select(AccessRecord.path, count_expr)
            .where(AccessRecord.created_at >= cutoff)
            .group_by(AccessRecord.path)
            .order_by(count_expr.desc())
            .limit(limit)
        )
        rows = log_session.exec(stmt).all()
        return TopPathsOut(
            data=[TopPathPoint(path=path, count=int(count or 0)) for path, count in rows]
        )
    finally:
        if log_session is not None and log_session is not session:
            log_session.close()


def _truncate_for_list(s: str | None, max_len: int = 200) -> str | None:
    if s is None or len(s) <= max_len:
        return s
    return s[:max_len] + "..."


def _to_access_public(r: AccessRecord) -> AccessRecordPublic:
    return AccessRecordPublic(
        id=r.id,
        api_assignment_id=r.api_assignment_id,
        app_client_id=r.app_client_id,
        ip_address=r.ip_address,
        http_method=r.http_method,
        path=r.path,
        status_code=r.status_code,
        created_at=r.created_at,
        duration_ms=getattr(r, "duration_ms", None),
        request_body=_truncate_for_list(r.request_body),
        request_headers=_truncate_for_list(r.request_headers),
        request_params=_truncate_for_list(r.request_params),
    )


@router.get(
    "/recent-access",
    response_model=RecentAccessOut,
    dependencies=[
        Depends(
            require_permission(ResourceTypeEnum.OVERVIEW, PermissionActionEnum.READ)
        )
    ],
)
def get_recent_access(
    session: SessionDep,
    current_user: CurrentUser,  # noqa: ARG001
    limit: int = RECENT_LIMIT,
) -> RecentAccessOut:
    """Latest AccessRecord entries (default limit=20). Uses external DB if configured."""
    import uuid as uuid_mod

    limit = max(1, min(100, limit))
    engine, use_main, use_starrocks_audit = get_log_engine_for_reading(session)

    if use_starrocks_audit and engine is not None:
        rows_raw = read_starrocks_audit_recent(engine, limit=limit)
        data = []
        for r in rows_raw:
            _id = r.get("id")
            data.append(
                AccessRecordPublic(
                    id=uuid_mod.UUID(_id) if isinstance(_id, str) else _id,
                    api_assignment_id=uuid_mod.UUID(r["api_assignment_id"]) if r.get("api_assignment_id") else None,
                    app_client_id=uuid_mod.UUID(r["app_client_id"]) if r.get("app_client_id") else None,
                    ip_address=r.get("ip_address") or "",
                    http_method=r.get("http_method") or "GET",
                    path=r.get("path") or "",
                    status_code=int(r["status_code"]) if r.get("status_code") is not None else 0,
                    created_at=r["created_at"],
                    duration_ms=r.get("duration_ms"),
                    request_body=_truncate_for_list(r.get("request_body")),
                    request_headers=_truncate_for_list(r.get("request_headers")),
                    request_params=_truncate_for_list(r.get("request_params")),
                )
            )
        return RecentAccessOut(data=data)

    log_session = session if use_main else SMSession(engine)
    try:
        stmt = select(AccessRecord).order_by(AccessRecord.created_at.desc()).limit(limit)
        rows = log_session.exec(stmt).all()
        return RecentAccessOut(data=[_to_access_public(r) for r in rows])
    finally:
        if log_session is not None and log_session is not session:
            log_session.close()


def _to_version_commit_public(
    v: VersionCommit,
    api: ApiAssignment | None = None,
    module: ApiModule | None = None,
    user: User | None = None,
) -> VersionCommitPublic:
    """Convert VersionCommit to public schema with API and user info."""
    http_method = None
    full_path = None

    if api and module:
        http_method = api.http_method.value if api.http_method else None
        # Build full path: /{module_path_prefix}/{api_path} (gateway pattern, not full URL)
        module_prefix = (module.path_prefix or "/").strip("/")
        api_path = api.path.strip("/")
        if module_prefix:
            full_path = f"/{module_prefix}/{api_path}"
        else:
            full_path = f"/{api_path}"

    committed_by_email = user.email if user else None

    return VersionCommitPublic(
        id=v.id,
        api_assignment_id=v.api_assignment_id,
        version=v.version,
        commit_message=v.commit_message,
        committed_by_id=v.committed_by_id,
        committed_by_email=committed_by_email,
        http_method=http_method,
        full_path=full_path,
        committed_at=v.committed_at,
    )


@router.get(
    "/recent-commits",
    response_model=RecentCommitsOut,
    dependencies=[
        Depends(
            require_permission(ResourceTypeEnum.OVERVIEW, PermissionActionEnum.READ)
        )
    ],
)
def get_recent_commits(
    session: SessionDep,
    current_user: CurrentUser,  # noqa: ARG001
    limit: int = RECENT_LIMIT,
) -> RecentCommitsOut:
    """Latest VersionCommit entries (default limit=20). content_snapshot excluded."""
    limit = max(1, min(100, limit))
    stmt = (
        select(VersionCommit).order_by(VersionCommit.committed_at.desc()).limit(limit)
    )
    rows = session.exec(stmt).all()

    # Load related data: ApiAssignment, ApiModule, User
    api_ids = {v.api_assignment_id for v in rows if v.api_assignment_id}
    apis = {}
    modules = {}
    if api_ids:
        api_rows = session.exec(
            select(ApiAssignment).where(ApiAssignment.id.in_(api_ids))
        ).all()
        apis = {a.id: a for a in api_rows}

        module_ids = {a.module_id for a in api_rows}
        if module_ids:
            module_rows = session.exec(
                select(ApiModule).where(ApiModule.id.in_(module_ids))
            ).all()
            modules = {m.id: m for m in module_rows}

    user_ids = {v.committed_by_id for v in rows if v.committed_by_id}
    users = {}
    if user_ids:
        user_rows = session.exec(select(User).where(User.id.in_(user_ids))).all()
        users = {u.id: u for u in user_rows}

    # Build public versions with related data
    public_versions = []
    for v in rows:
        api = apis.get(v.api_assignment_id) if v.api_assignment_id else None
        module = modules.get(api.module_id) if api else None
        user = users.get(v.committed_by_id) if v.committed_by_id else None
        public_versions.append(_to_version_commit_public(v, api, module, user))

    return RecentCommitsOut(data=public_versions)
