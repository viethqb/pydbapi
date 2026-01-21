"""
FirewallRules management (Phase 2, Task 2.5).

Endpoints: list (POST), create, update, delete, detail.
"""

import uuid
from typing import Any

from fastapi import APIRouter, HTTPException
from sqlmodel import func, select

from app.api.deps import CurrentUser, SessionDep
from app.models import Message
from app.models_dbapi import FirewallRules
from app.schemas_dbapi import (
    FirewallRuleCreate,
    FirewallRuleListIn,
    FirewallRuleListOut,
    FirewallRulePublic,
    FirewallRuleUpdate,
)

router = APIRouter(prefix="/firewall", tags=["firewall"])


def _to_public(r: FirewallRules) -> FirewallRulePublic:
    """Build FirewallRulePublic from FirewallRules."""
    return FirewallRulePublic(
        id=r.id,
        rule_type=r.rule_type,
        ip_range=r.ip_range,
        description=r.description,
        is_active=r.is_active,
        sort_order=r.sort_order,
        created_at=r.created_at,
        updated_at=r.updated_at,
    )


def _list_filters(stmt: Any, body: FirewallRuleListIn) -> Any:
    """Apply optional filters to FirewallRules select statement."""
    if body.rule_type is not None:
        stmt = stmt.where(FirewallRules.rule_type == body.rule_type)
    if body.is_active is not None:
        stmt = stmt.where(FirewallRules.is_active == body.is_active)
    return stmt


@router.post("/list", response_model=FirewallRuleListOut)
def list_firewall_rules(
    session: SessionDep,
    current_user: CurrentUser,  # noqa: ARG001
    body: FirewallRuleListIn,
) -> Any:
    """List firewall rules with pagination and optional filters (rule_type, is_active)."""
    count_stmt = _list_filters(select(func.count()).select_from(FirewallRules), body)
    total = session.exec(count_stmt).one()

    stmt = _list_filters(select(FirewallRules), body)
    offset = (body.page - 1) * body.page_size
    stmt = (
        stmt.order_by(FirewallRules.sort_order.asc(), FirewallRules.created_at.desc())
        .offset(offset)
        .limit(body.page_size)
    )
    rows = session.exec(stmt).all()

    return FirewallRuleListOut(data=[_to_public(r) for r in rows], total=total)


@router.post("/create", response_model=FirewallRulePublic)
def create_firewall_rule(
    session: SessionDep,
    current_user: CurrentUser,  # noqa: ARG001
    body: FirewallRuleCreate,
) -> Any:
    """Create a new firewall rule."""
    r = FirewallRules(
        rule_type=body.rule_type,
        ip_range=body.ip_range,
        description=body.description,
        is_active=body.is_active,
        sort_order=body.sort_order,
    )
    session.add(r)
    session.commit()
    session.refresh(r)
    return _to_public(r)


@router.post("/update", response_model=FirewallRulePublic)
def update_firewall_rule(
    session: SessionDep,
    current_user: CurrentUser,  # noqa: ARG001
    body: FirewallRuleUpdate,
) -> Any:
    """Update an existing firewall rule."""
    r = session.get(FirewallRules, body.id)
    if not r:
        raise HTTPException(status_code=404, detail="Firewall rule not found")
    update = body.model_dump(exclude_unset=True, exclude={"id"})
    r.sqlmodel_update(update)
    session.add(r)
    session.commit()
    session.refresh(r)
    return _to_public(r)


@router.delete("/delete/{id}", response_model=Message)
def delete_firewall_rule(
    session: SessionDep,
    current_user: CurrentUser,  # noqa: ARG001
    id: uuid.UUID,
) -> Any:
    """Delete a firewall rule by id."""
    r = session.get(FirewallRules, id)
    if not r:
        raise HTTPException(status_code=404, detail="Firewall rule not found")
    session.delete(r)
    session.commit()
    return Message(message="Firewall rule deleted successfully")


@router.get("/{id}", response_model=FirewallRulePublic)
def get_firewall_rule(
    session: SessionDep,
    current_user: CurrentUser,  # noqa: ARG001
    id: uuid.UUID,
) -> Any:
    """Get firewall rule detail by id."""
    r = session.get(FirewallRules, id)
    if not r:
        raise HTTPException(status_code=404, detail="Firewall rule not found")
    return _to_public(r)
