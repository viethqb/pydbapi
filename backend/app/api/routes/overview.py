"""
Overview / Dashboard (Phase 2, Task 2.7).

Endpoints: stats, recent-access, recent-commits.
"""

from datetime import date, datetime, timedelta, timezone

from fastapi import APIRouter, Depends
from sqlmodel import func, select

from app.api.deps import CurrentUser, SessionDep, require_permission
from app.models_permission import PermissionActionEnum, ResourceTypeEnum
from app.models_dbapi import (
    AccessRecord,
    ApiAssignment,
    ApiGroup,
    ApiModule,
    AppClient,
    DataSource,
    VersionCommit,
)
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
    """Requests grouped by day from AccessRecord.created_at."""
    days = max(1, min(365, days))
    cutoff = datetime.now(timezone.utc) - timedelta(days=days)

    day_expr = func.date(AccessRecord.created_at).label("day")
    count_expr = func.count().label("count")
    stmt = (
        select(day_expr, count_expr)
        .where(AccessRecord.created_at >= cutoff)
        .group_by(day_expr)
        .order_by(day_expr.asc())
    )
    rows = session.exec(stmt).all()

    points: list[RequestsByDayPoint] = []
    for day_value, count_value in rows:
        if isinstance(day_value, datetime):
            day_value = day_value.date()
        elif isinstance(day_value, str):
            # SQLite returns YYYY-MM-DD strings for date(...)
            day_value = date.fromisoformat(day_value.split("T")[0])
        points.append(RequestsByDayPoint(day=day_value, count=int(count_value or 0)))

    return RequestsByDayOut(data=points)


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
    """Top accessed paths within the last N days."""
    days = max(1, min(365, days))
    limit = max(1, min(100, limit))
    cutoff = datetime.now(timezone.utc) - timedelta(days=days)

    count_expr = func.count().label("count")
    stmt = (
        select(AccessRecord.path, count_expr)
        .where(AccessRecord.created_at >= cutoff)
        .group_by(AccessRecord.path)
        .order_by(count_expr.desc())
        .limit(limit)
    )
    rows = session.exec(stmt).all()
    return TopPathsOut(
        data=[TopPathPoint(path=path, count=int(count or 0)) for path, count in rows]
    )


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
    """Latest AccessRecord entries (default limit=20). request_body excluded."""
    limit = max(1, min(100, limit))
    stmt = select(AccessRecord).order_by(AccessRecord.created_at.desc()).limit(limit)
    rows = session.exec(stmt).all()
    return RecentAccessOut(data=[_to_access_public(r) for r in rows])


def _to_version_commit_public(v: VersionCommit) -> VersionCommitPublic:
    return VersionCommitPublic(
        id=v.id,
        api_assignment_id=v.api_assignment_id,
        version=v.version,
        commit_message=v.commit_message,
        committed_by_id=v.committed_by_id,
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
    return RecentCommitsOut(data=[_to_version_commit_public(v) for v in rows])
