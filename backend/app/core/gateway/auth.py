"""
Gateway auth (Phase 4, Task 4.2a): verify_gateway_client.

Supports: Bearer JWT, Basic (client_id:client_secret), X-API-Key (base64(client_id:client_secret)).
"""

import base64
import binascii

import jwt
from fastapi import Request
from jwt.exceptions import InvalidTokenError
from sqlmodel import Session, select

from app.core.config import settings
from app.core.security import ALGORITHM, verify_password
from app.models_dbapi import AppClient


def _decode_basic_or_apikey(value: str) -> tuple[str, str] | None:
    """Decode base64(client_id:client_secret). Returns (client_id, client_secret) or None."""
    try:
        raw = base64.b64decode(value, validate=True).decode("utf-8")
    except (binascii.Error, UnicodeDecodeError):
        return None
    if ":" not in raw:
        return None
    parts = raw.split(":", 1)
    return (parts[0].strip(), parts[1]) if parts[0] and parts[1] else None


def _get_client_by_client_id(session: Session, client_id: str) -> AppClient | None:
    """Fetch AppClient by client_id, is_active=True."""
    stmt = select(AppClient).where(
        AppClient.client_id == client_id,
        AppClient.is_active.is_(True),
    )
    return session.exec(stmt).first()


def verify_gateway_client(request: Request, session: Session) -> AppClient | None:
    """
    Authenticate Gateway request. Tries, in order: Bearer JWT, Basic, X-API-Key.

    - Bearer: decode JWT, sub=client_id → load AppClient, check is_active.
    - Basic: decode base64(Authorization value) → client_id:client_secret → verify_password.
    - X-API-Key: same as Basic, if GATEWAY_AUTH_X_API_KEY_ENABLED.

    Returns AppClient or None.
    """
    auth = request.headers.get("Authorization") or ""
    x_api_key = request.headers.get("X-API-Key") if settings.GATEWAY_AUTH_X_API_KEY_ENABLED else None

    # 1) Bearer JWT
    if auth.startswith("Bearer "):
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

    # 2) Basic
    if auth.startswith("Basic "):
        encoded = auth[6:].strip()
        if not encoded:
            return None
        parsed = _decode_basic_or_apikey(encoded)
        if not parsed:
            return None
        client_id, client_secret = parsed
        client = _get_client_by_client_id(session, client_id)
        if not client or not verify_password(client_secret, client.client_secret):
            return None
        return client

    # 3) X-API-Key
    if x_api_key and isinstance(x_api_key, str) and x_api_key.strip():
        parsed = _decode_basic_or_apikey(x_api_key.strip())
        if not parsed:
            return None
        client_id, client_secret = parsed
        client = _get_client_by_client_id(session, client_id)
        if not client or not verify_password(client_secret, client.client_secret):
            return None
        return client

    return None
