"""
Gateway auth (Phase 4, Task 4.2a): verify_gateway_client.

Supports only Bearer JWT (obtained from POST /api/token/generate with client_id and client_secret).

Also: client_can_access_api — client can only call private APIs that belong to at least one
ApiGroup assigned to the client (app_client_group_link + api_assignment_group_link), or that are
assigned directly (app_client_api_link).
"""

import collections
import threading
import time
from uuid import UUID

import jwt
from jwt.exceptions import InvalidTokenError
from sqlmodel import Session, select

from app.core.config import settings
from app.core.security import ALGORITHM, TOKEN_TYPE_DASHBOARD
from app.core.token_blocklist import is_token_revoked
from app.models_dbapi import (
    ApiAssignmentGroupLink,
    AppClient,
    AppClientApiLink,
    AppClientGroupLink,
)

_CLIENT_CACHE_TTL_SEC = 30.0
_CLIENT_CACHE_LOCK = threading.Lock()
_CLIENT_CACHE: dict[str, tuple[AppClient | None, float]] = {}

_PERM_CACHE_TTL_SEC = 10.0
_PERM_CACHE_LOCK = threading.Lock()
_PERM_CACHE: collections.OrderedDict[tuple[UUID, UUID], tuple[bool, float]] = (
    collections.OrderedDict()
)
_PERM_CACHE_MAX_SIZE = 10_000


def _get_client_by_client_id(session: Session, client_id: str) -> AppClient | None:
    """Fetch AppClient by client_id, is_active=True, with a short-lived in-process cache."""
    now = time.monotonic()
    with _CLIENT_CACHE_LOCK:
        entry = _CLIENT_CACHE.get(client_id)
        if entry is not None:
            client, expires_at = entry
            if now < expires_at:
                return client
            _CLIENT_CACHE.pop(client_id, None)

    stmt = select(AppClient).where(
        AppClient.client_id == client_id,
        AppClient.is_active.is_(True),
    )
    client = session.exec(stmt).first()

    with _CLIENT_CACHE_LOCK:
        _CLIENT_CACHE[client_id] = (client, now + _CLIENT_CACHE_TTL_SEC)

    return client


def verify_gateway_client(auth_header: str, session: Session) -> AppClient | None:
    """
    Authenticate Gateway request. Supports:
    - Authorization: Bearer <token> (JWT)
    - Authorization: <token> (raw token, legacy migration)

    *auth_header*: the raw ``Authorization`` header value.

    JWT is obtained from POST /api/token/generate or GET /api/token/generate?clientId=&secret=.

    Returns AppClient or None.
    """
    auth = (auth_header or "").strip()
    if not auth:
        return None

    # Bearer <token> or raw <token>
    if auth.startswith("Bearer "):
        token = auth[7:].strip()
    else:
        token = auth
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

    if payload.get("type") == TOKEN_TYPE_DASHBOARD:
        return None

    jti = payload.get("jti")
    if jti and is_token_revoked(jti):
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
    cache_key = (app_client_id, api_assignment_id)
    now = time.monotonic()

    with _PERM_CACHE_LOCK:
        entry = _PERM_CACHE.get(cache_key)
        if entry is not None:
            allowed, expires_at = entry
            if now < expires_at:
                _PERM_CACHE.move_to_end(cache_key)
                return allowed
            _PERM_CACHE.pop(cache_key, None)

    # (2) Direct API: check app_client_api_link
    direct = session.exec(
        select(AppClientApiLink).where(
            AppClientApiLink.app_client_id == app_client_id,
            AppClientApiLink.api_assignment_id == api_assignment_id,
        )
    ).first()
    if direct is not None:
        allowed = True
    else:
        # (1) Group: single query checking if any client group overlaps with API groups
        overlap = session.exec(
            select(AppClientGroupLink.api_group_id).where(
                AppClientGroupLink.app_client_id == app_client_id,
                AppClientGroupLink.api_group_id.in_(
                    select(ApiAssignmentGroupLink.api_group_id).where(
                        ApiAssignmentGroupLink.api_assignment_id == api_assignment_id
                    )
                ),
            )
        ).first()
        allowed = overlap is not None

    with _PERM_CACHE_LOCK:
        if len(_PERM_CACHE) >= _PERM_CACHE_MAX_SIZE:
            # LRU eviction: pop from front (least recently used)
            evict_count = _PERM_CACHE_MAX_SIZE // 4
            for _ in range(min(evict_count, len(_PERM_CACHE))):
                _PERM_CACHE.popitem(last=False)
        _PERM_CACHE[cache_key] = (allowed, now + _PERM_CACHE_TTL_SEC)
        _PERM_CACHE.move_to_end(cache_key)

    return allowed
