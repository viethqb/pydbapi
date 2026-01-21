"""
UnifyAlarm management (Phase 2, Task 2.5).

Endpoints: list (POST), create, update, delete, detail.
"""

import uuid
from typing import Any

from fastapi import APIRouter, HTTPException
from sqlmodel import func, select

from app.api.deps import CurrentUser, SessionDep
from app.models import Message
from app.models_dbapi import UnifyAlarm
from app.schemas_dbapi import (
    UnifyAlarmCreate,
    UnifyAlarmListIn,
    UnifyAlarmListOut,
    UnifyAlarmPublic,
    UnifyAlarmUpdate,
)

router = APIRouter(prefix="/alarm", tags=["alarm"])


def _to_public(a: UnifyAlarm) -> UnifyAlarmPublic:
    """Build UnifyAlarmPublic from UnifyAlarm."""
    return UnifyAlarmPublic(
        id=a.id,
        name=a.name,
        alarm_type=a.alarm_type,
        config=a.config or {},
        is_enabled=a.is_enabled,
        created_at=a.created_at,
        updated_at=a.updated_at,
    )


def _list_filters(stmt: Any, body: UnifyAlarmListIn) -> Any:
    """Apply optional filters to UnifyAlarm select statement."""
    if body.alarm_type is not None:
        stmt = stmt.where(UnifyAlarm.alarm_type == body.alarm_type)
    if body.is_enabled is not None:
        stmt = stmt.where(UnifyAlarm.is_enabled == body.is_enabled)
    return stmt


@router.post("/list", response_model=UnifyAlarmListOut)
def list_alarms(
    session: SessionDep,
    current_user: CurrentUser,  # noqa: ARG001
    body: UnifyAlarmListIn,
) -> Any:
    """List alarms with pagination and optional filters (alarm_type, is_enabled)."""
    count_stmt = _list_filters(select(func.count()).select_from(UnifyAlarm), body)
    total = session.exec(count_stmt).one()

    stmt = _list_filters(select(UnifyAlarm), body)
    offset = (body.page - 1) * body.page_size
    stmt = stmt.order_by(UnifyAlarm.created_at.desc()).offset(offset).limit(body.page_size)
    rows = session.exec(stmt).all()

    return UnifyAlarmListOut(data=[_to_public(r) for r in rows], total=total)


@router.post("/create", response_model=UnifyAlarmPublic)
def create_alarm(
    session: SessionDep,
    current_user: CurrentUser,  # noqa: ARG001
    body: UnifyAlarmCreate,
) -> Any:
    """Create a new alarm (name, alarm_type, config, is_enabled?)."""
    a = UnifyAlarm(
        name=body.name,
        alarm_type=body.alarm_type,
        config=body.config,
        is_enabled=body.is_enabled,
    )
    session.add(a)
    session.commit()
    session.refresh(a)
    return _to_public(a)


@router.post("/update", response_model=UnifyAlarmPublic)
def update_alarm(
    session: SessionDep,
    current_user: CurrentUser,  # noqa: ARG001
    body: UnifyAlarmUpdate,
) -> Any:
    """Update an existing alarm."""
    a = session.get(UnifyAlarm, body.id)
    if not a:
        raise HTTPException(status_code=404, detail="Alarm not found")
    update = body.model_dump(exclude_unset=True, exclude={"id"})
    a.sqlmodel_update(update)
    session.add(a)
    session.commit()
    session.refresh(a)
    return _to_public(a)


@router.delete("/delete/{id}", response_model=Message)
def delete_alarm(
    session: SessionDep,
    current_user: CurrentUser,  # noqa: ARG001
    id: uuid.UUID,
) -> Any:
    """Delete an alarm by id."""
    a = session.get(UnifyAlarm, id)
    if not a:
        raise HTTPException(status_code=404, detail="Alarm not found")
    session.delete(a)
    session.commit()
    return Message(message="Alarm deleted successfully")


@router.get("/{id}", response_model=UnifyAlarmPublic)
def get_alarm(
    session: SessionDep,
    current_user: CurrentUser,  # noqa: ARG001
    id: uuid.UUID,
) -> Any:
    """Get alarm detail by id."""
    a = session.get(UnifyAlarm, id)
    if not a:
        raise HTTPException(status_code=404, detail="Alarm not found")
    return _to_public(a)
