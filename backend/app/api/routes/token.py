"""
Token (Phase 4, Task 4.2a): POST /token/generate – client credentials → JWT.
Legacy migration: GET /token/generate?clientId=&secret= → { expireAt, token }.
"""

from datetime import datetime, timedelta, timezone
from typing import Any

from fastapi import APIRouter, HTTPException, Request
from pydantic import ValidationError
from sqlmodel import Session, select

from app.api.deps import SessionDep
from app.core.config import settings
from app.core.security import create_access_token, verify_password
from app.models_dbapi import AppClient
from app.schemas_dbapi import (
    GatewayTokenGenerateGetResponse,
    GatewayTokenIn,
    GatewayTokenResponse,
)

router = APIRouter(prefix="/token", tags=["token"])


def _get_client_by_client_id(session: Session, client_id: str) -> AppClient | None:
    stmt = select(AppClient).where(
        AppClient.client_id == client_id,
        AppClient.is_active.is_(True),
    )
    return session.exec(stmt).first()


@router.post("/generate", response_model=GatewayTokenResponse)
async def token_generate(
    request: Request,
    session: SessionDep,
) -> Any:
    """
    OAuth2-style client_credentials: exchange client_id and client_secret for a JWT.

    Accepts JSON (application/json) or form (application/x-www-form-urlencoded).
    Does not require Authorization (this is where the token is obtained).
    """
    ct = (request.headers.get("content-type") or "").split(";")[0].strip().lower()

    if ct == "application/json":
        try:
            data = await request.json()
        except Exception:
            raise HTTPException(status_code=400, detail="Invalid JSON body")
    else:
        form = await request.form()
        data = {
            "client_id": form.get("client_id") or "",
            "client_secret": form.get("client_secret") or "",
            "grant_type": form.get("grant_type") or "client_credentials",
        }

    try:
        body = GatewayTokenIn.model_validate(data)
    except ValidationError as e:
        raise HTTPException(status_code=422, detail=e.errors())

    if body.grant_type != "client_credentials":
        raise HTTPException(status_code=400, detail="Unsupported grant_type")

    client = _get_client_by_client_id(session, body.client_id)
    if not client:
        raise HTTPException(
            status_code=401, detail="Invalid client_id or client_secret"
        )

    if not verify_password(body.client_secret, client.client_secret):
        raise HTTPException(
            status_code=401, detail="Invalid client_id or client_secret"
        )

    expires_delta = timedelta(seconds=settings.GATEWAY_JWT_EXPIRE_SECONDS)
    access_token = create_access_token(
        subject=client.client_id, expires_delta=expires_delta
    )

    return GatewayTokenResponse(
        access_token=access_token,
        token_type="bearer",
        expires_in=settings.GATEWAY_JWT_EXPIRE_SECONDS,
    )


@router.get("/generate", response_model=GatewayTokenGenerateGetResponse)
def token_generate_get(
    clientId: str,
    secret: str,
    session: SessionDep,
) -> Any:
    """
    Legacy migration: GET /token/generate?clientId=XXXX&secret=YYYY.
    Returns { expireAt: unixtime, token } (no Bearer prefix required in Authorization).
    """
    client = _get_client_by_client_id(session, clientId)
    if not client:
        raise HTTPException(
            status_code=401, detail="Invalid client_id or client_secret"
        )

    if not verify_password(secret, client.client_secret):
        raise HTTPException(
            status_code=401, detail="Invalid client_id or client_secret"
        )

    expires_delta = timedelta(seconds=settings.GATEWAY_JWT_EXPIRE_SECONDS)
    expire_dt = datetime.now(timezone.utc) + expires_delta
    expire_at = int(expire_dt.timestamp())
    access_token = create_access_token(
        subject=client.client_id, expires_delta=expires_delta
    )

    return GatewayTokenGenerateGetResponse(
        expireAt=expire_at,
        token=access_token,
    )
