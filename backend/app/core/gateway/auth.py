"""
Gateway auth (Phase 4, Task 4.2a): verify_gateway_client.

Supports only Bearer JWT (obtained from POST /token/generate with client_id and client_secret).

Also: client_can_access_api — client can only call private APIs that belong to at least one
ApiGroup assigned to the client (app_client_group_link + api_assignment_group_link), or that are
assigned directly (app_client_api_link).
"""

from uuid import UUID

import jwt
from fastapi import Request
from jwt.exceptions import InvalidTokenError
from sqlmodel import Session, select

from app.core.config import settings
from app.models_dbapi import (
    ApiAssignmentGroupLink,
    AppClient,
    AppClientApiLink,
    AppClientGroupLink,
)
from app.core.security import ALGORITHM


def _get_client_by_client_id(session: Session, client_id: str) -> AppClient | None:
    """Fetch AppClient by client_id, is_active=True."""
    stmt = select(AppClient).where(
        AppClient.client_id == client_id,
        AppClient.is_active.is_(True),
    )
    return session.exec(stmt).first()


def verify_gateway_client(request: Request, session: Session) -> AppClient | None:
    """
    Authenticate Gateway request. Only Bearer JWT is supported.

    Bearer: decode JWT, sub=client_id → load AppClient, check is_active.
    JWT is obtained from POST /token/generate with client_id and client_secret.

    Returns AppClient or None.
    """
    auth = request.headers.get("Authorization") or ""

    if not auth.startswith("Bearer "):
        return None

    token = auth[7:].strip()
    if not token:
        return None

    try:
        payload = jwt.decode(
            token,
            settings.SECRET_KEY,
            algorithms=[ALGORITHM],
            options={"verify_exp": True},
        )
    except InvalidTokenError:
        return None

    client_id = payload.get("sub")
    if not client_id or not isinstance(client_id, str):
        return None

    return _get_client_by_client_id(session, client_id)


def client_can_access_api(
    session: Session,
    app_client_id: UUID,
    api_assignment_id: UUID,
) -> bool:
    """
    True if the client is allowed to call the API, via:
    (1) Group: API belongs to at least one ApiGroup assigned to the client;
    (2) Direct API: API is in app_client_api_link (client assigned directly).
    """
    # (2) Direct API: check app_client_api_link
    direct = session.exec(
        select(AppClientApiLink).where(
            AppClientApiLink.app_client_id == app_client_id,
            AppClientApiLink.api_assignment_id == api_assignment_id,
        )
    ).first()
    if direct is not None:
        return True

    # (1) Group: client's groups intersect with API's groups
    client_group_ids_stmt = select(AppClientGroupLink.api_group_id).where(
        AppClientGroupLink.app_client_id == app_client_id
    )
    client_group_ids = set(session.exec(client_group_ids_stmt).all())
    if not client_group_ids:
        return False
    overlap = session.exec(
        select(ApiAssignmentGroupLink.api_group_id).where(
            ApiAssignmentGroupLink.api_assignment_id == api_assignment_id,
            ApiAssignmentGroupLink.api_group_id.in_(client_group_ids),
        )
    ).first()
    return overlap is not None
