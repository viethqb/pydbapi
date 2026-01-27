"""
Overview / Dashboard (Phase 2, Task 2.7).

Endpoints: stats, recent-access, recent-commits.
"""

from fastapi import APIRouter
from sqlmodel import func, select

from app.api.deps import CurrentUser, SessionDep
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
    VersionCommitPublic,
)

router = APIRouter(prefix="/overview", tags=["overview"])

# Default limit for recent-access and recent-commits
RECENT_LIMIT = 20


def _count(session, model, where=None):
    """Count rows in model; optional where clause."""
    stmt = select(func.count()).select_from(model)
    if where is not None:
        stmt = stmt.where(where)
    return session.exec(stmt).one() or 0


@router.get("/stats", response_model=OverviewStats)
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
        apis_published=_count(session, ApiAssignment, ApiAssignment.is_published == True),
        clients=_count(session, AppClient),
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


@router.get("/recent-access", response_model=RecentAccessOut)
def get_recent_access(
    session: SessionDep,
    current_user: CurrentUser,  # noqa: ARG001
    limit: int = RECENT_LIMIT,
) -> RecentAccessOut:
    """Latest AccessRecord entries (default limit=20). request_body excluded."""
    limit = max(1, min(100, limit))
    stmt = (
        select(AccessRecord)
        .order_by(AccessRecord.created_at.desc())
        .limit(limit)
    )
    rows = session.exec(stmt).all()
    return RecentAccessOut(data=[_to_access_public(r) for r in rows])


def _to_version_commit_public(v: VersionCommit) -> VersionCommitPublic:
    return VersionCommitPublic(
        id=v.id,
        api_assignment_id=v.api_assignment_id,
        version=v.version,
        commit_message=v.commit_message,
        committed_at=v.committed_at,
    )


@router.get("/recent-commits", response_model=RecentCommitsOut)
def get_recent_commits(
    session: SessionDep,
    current_user: CurrentUser,  # noqa: ARG001
    limit: int = RECENT_LIMIT,
) -> RecentCommitsOut:
    """Latest VersionCommit entries (default limit=20). content_snapshot excluded."""
    limit = max(1, min(100, limit))
    stmt = (
        select(VersionCommit)
        .order_by(VersionCommit.committed_at.desc())
        .limit(limit)
    )
    rows = session.exec(stmt).all()
    return RecentCommitsOut(data=[_to_version_commit_public(v) for v in rows])
