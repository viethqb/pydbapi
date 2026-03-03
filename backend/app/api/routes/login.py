from datetime import UTC, datetime, timedelta
from typing import Annotated, Any

import jwt as pyjwt
from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import OAuth2PasswordRequestForm

from app import crud
from app.api.deps import (
    CurrentUser,
    SessionDep,
    TokenDep,
    require_rate_limit,
)
from app.core import security
from app.core.config import settings
from app.core.security import TOKEN_TYPE_DASHBOARD, get_password_hash
from app.core.token_blocklist import revoke_token
from app.models import Message, NewPassword, Token, UserPublic
from app.utils import verify_password_reset_token

router = APIRouter(tags=["login"])


@router.post(
    "/login/access-token",
    dependencies=[Depends(require_rate_limit("login", settings.AUTH_RATE_LIMIT_LOGIN))],
)
def login_access_token(
    session: SessionDep, form_data: Annotated[OAuth2PasswordRequestForm, Depends()]
) -> Token:
    """
    OAuth2 compatible token login, get an access token for future requests
    """
    user = crud.authenticate(
        session=session, username=form_data.username, password=form_data.password
    )
    if not user:
        raise HTTPException(status_code=400, detail="Incorrect username or password")
    elif not user.is_active:
        raise HTTPException(status_code=400, detail="Inactive user")
    access_token_expires = timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    return Token(
        access_token=security.create_access_token(
            user.id,
            expires_delta=access_token_expires,
            token_type=TOKEN_TYPE_DASHBOARD,
        )
    )


@router.post("/login/test-token", response_model=UserPublic)
def test_token(current_user: CurrentUser) -> Any:
    """
    Test access token
    """
    return current_user


@router.post("/logout")
def logout(current_user: CurrentUser, token: TokenDep) -> Message:  # noqa: ARG001
    """
    Revoke the current access token (server-side logout).
    """
    try:
        payload = pyjwt.decode(
            token, settings.SECRET_KEY, algorithms=[security.ALGORITHM]
        )
    except pyjwt.exceptions.InvalidTokenError:
        raise HTTPException(status_code=400, detail="Invalid token")
    jti = payload.get("jti")
    exp_ts = payload.get("exp")
    if jti and exp_ts:
        revoke_token(jti, datetime.fromtimestamp(exp_ts, tz=UTC))
    return Message(message="Logged out")


@router.post(
    "/reset-password/",
    dependencies=[
        Depends(require_rate_limit("reset", settings.AUTH_RATE_LIMIT_RESET_PASSWORD))
    ],
)
def reset_password(session: SessionDep, body: NewPassword) -> Message:
    """
    Reset password
    """
    email = verify_password_reset_token(token=body.token)
    if not email:
        raise HTTPException(status_code=400, detail="Invalid token")
    user = crud.get_user_by_email(session=session, email=email)
    if not user or not user.is_active:
        raise HTTPException(status_code=400, detail="Invalid token")
    hashed_password = get_password_hash(password=body.new_password)
    user.hashed_password = hashed_password
    session.add(user)
    session.commit()
    return Message(message="Password updated successfully")
