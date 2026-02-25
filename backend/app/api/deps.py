import uuid
from collections.abc import Callable, Generator
from typing import Annotated, Any, TypeVar

import jwt
from fastapi import Depends, HTTPException, Request, status
from fastapi.security import OAuth2PasswordBearer
from jwt.exceptions import InvalidTokenError
from pydantic import ValidationError
from sqlmodel import Session

from app.core import security
from app.core.config import settings
from app.core.db import engine
from app.core.permission import has_permission
from app.core.security import TOKEN_TYPE_GATEWAY
from app.models import TokenPayload, User
from app.models_permission import PermissionActionEnum, ResourceTypeEnum

reusable_oauth2 = OAuth2PasswordBearer(
    tokenUrl=f"{settings.API_V1_STR}/login/access-token"
)


def get_db() -> Generator[Session, None, None]:
    with Session(engine) as session:
        yield session


SessionDep = Annotated[Session, Depends(get_db)]
TokenDep = Annotated[str, Depends(reusable_oauth2)]


def get_current_user(session: SessionDep, token: TokenDep) -> User:
    try:
        payload = jwt.decode(
            token, settings.SECRET_KEY, algorithms=[security.ALGORITHM]
        )
        token_data = TokenPayload(**payload)
    except (InvalidTokenError, ValidationError):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Could not validate credentials",
        )
    if payload.get("type") == TOKEN_TYPE_GATEWAY:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Gateway tokens cannot access management API",
        )
    user = session.get(User, token_data.sub)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if not user.is_active:
        raise HTTPException(status_code=400, detail="Inactive user")
    return user


CurrentUser = Annotated[User, Depends(get_current_user)]


def get_current_active_superuser(current_user: CurrentUser) -> User:
    if not current_user.is_superuser:
        raise HTTPException(
            status_code=403, detail="The user doesn't have enough privileges"
        )
    return current_user


CurrentSuperuser = Annotated[User, Depends(get_current_active_superuser)]


def require_permission(
    resource_type: ResourceTypeEnum | str,
    action: PermissionActionEnum | str,
) -> Callable[..., User]:
    """
    Dependency factory: require the current user to have the given permission.
    Use: Depends(require_permission(ResourceTypeEnum.DATASOURCE, PermissionActionEnum.READ)).
    """

    def _dependency(session: SessionDep, current_user: CurrentUser) -> User:
        if has_permission(session, current_user, resource_type, action, None):
            return current_user
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Permission required: {resource_type}.{action}",
        )

    return _dependency


def require_permission_for_resource(
    resource_type: ResourceTypeEnum | str,
    action: PermissionActionEnum | str,
    resource_id_getter: Callable[..., uuid.UUID | None],
) -> Callable[..., User]:
    """
    Dependency factory that checks for global permission first, then scoped permission.

    `resource_id_getter` receives session, current_user, and request.path_params
    so it can resolve the target resource id.
    """

    def _dependency(
        request: Request,
        session: SessionDep,
        current_user: CurrentUser,
    ) -> User:
        if has_permission(session, current_user, resource_type, action, None):
            return current_user

        path_params: dict[str, Any] = {}
        for k, v in request.path_params.items():
            if k in ("id", "version_id"):
                try:
                    path_params[k] = uuid.UUID(v)
                except (ValueError, TypeError):
                    path_params[k] = v
            else:
                path_params[k] = v
        resource_id = resource_id_getter(
            session=session,
            current_user=current_user,
            **path_params,
        )
        if resource_id is not None and has_permission(
            session, current_user, resource_type, action, resource_id
        ):
            return current_user

        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Permission required: {resource_type}.{action}",
        )

    return _dependency


T = TypeVar("T")


def require_permission_for_body_resource(
    resource_type: ResourceTypeEnum | str,
    action: PermissionActionEnum | str,
    body_type: type[T],
    resource_id_getter: Callable[..., uuid.UUID | None],
) -> Callable[..., User]:
    """
    For routes that get resource_id from request body (e.g. update).
    Avoids **kwargs which causes FastAPI to require query param "kwargs".
    """

    def _dependency(
        session: SessionDep,
        current_user: CurrentUser,
        body: body_type,
    ) -> User:
        if has_permission(session, current_user, resource_type, action, None):
            return current_user
        resource_id = resource_id_getter(
            session=session, current_user=current_user, body=body
        )
        if resource_id is not None and has_permission(
            session, current_user, resource_type, action, resource_id
        ):
            return current_user
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Permission required: {resource_type}.{action}",
        )

    return _dependency


def require_permission_or_owner(
    resource_type: ResourceTypeEnum | str,
    action: PermissionActionEnum | str,
    get_owner_id: Callable[[], uuid.UUID | None] | None = None,
) -> Callable[..., User]:
    """
    Dependency: allow if user has permission or is the owner of the resource.
    get_owner_id: optional callable returning the resource's owner user id (e.g. created_by_id).
    Phase 2: ownership not used yet; only permission is checked.
    """

    def _dependency(session: SessionDep, current_user: CurrentUser) -> User:
        if has_permission(session, current_user, resource_type, action, None):
            return current_user
        if get_owner_id is not None:
            owner_id = get_owner_id()
            if owner_id is not None and owner_id == current_user.id:
                return current_user
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Permission required or ownership: {resource_type}.{action}",
        )

    return _dependency
