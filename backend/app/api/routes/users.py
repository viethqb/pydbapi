import uuid
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import delete
from sqlmodel import func, select

from app import crud
from app.api.deps import (
    CurrentUser,
    SessionDep,
    get_current_active_superuser,
)
from app.core.permission import has_permission
from app.models_permission import PermissionActionEnum, ResourceTypeEnum
from app.core.config import settings
from app.core.permission import get_my_permissions_flat
from app.core.security import get_password_hash, verify_password
from app.models import (
    Message,
    UpdatePassword,
    User,
    UserCreate,
    UserPublic,
    UserRegister,
    UsersPublic,
    UserUpdate,
    UserUpdateMe,
)
from app.models_permission import Role, UserRoleLink
from app.utils import generate_new_account_email, send_email

router = APIRouter(prefix="/users", tags=["users"])


class PermissionItem(BaseModel):
    """Single permission entry for GET /me/permissions."""

    resource_type: str
    action: str
    resource_id: uuid.UUID | None = None


class MyPermissionsOut(BaseModel):
    """Response for GET /users/me/permissions."""

    data: list[PermissionItem]


@router.get(
    "/",
    dependencies=[Depends(get_current_active_superuser)],
    response_model=UsersPublic,
)
def read_users(session: SessionDep, skip: int = 0, limit: int = 100) -> Any:
    """
    Retrieve users.
    """

    count_statement = select(func.count()).select_from(User)
    count = session.exec(count_statement).one()

    statement = select(User).offset(skip).limit(limit)
    users = session.exec(statement).all()

    return UsersPublic(data=users, count=count)


@router.post(
    "/", dependencies=[Depends(get_current_active_superuser)], response_model=UserPublic
)
def create_user(*, session: SessionDep, user_in: UserCreate) -> Any:
    """
    Create new user.
    """
    user = crud.get_user_by_email(session=session, email=user_in.email)
    if user:
        raise HTTPException(
            status_code=400,
            detail="The user with this email already exists in the system.",
        )

    user = crud.create_user(session=session, user_create=user_in)
    if settings.emails_enabled and user_in.email:
        email_data = generate_new_account_email(
            email_to=user_in.email, username=user_in.email, password=user_in.password
        )
        send_email(
            email_to=user_in.email,
            subject=email_data.subject,
            html_content=email_data.html_content,
        )
    return user


@router.patch("/me", response_model=UserPublic)
def update_user_me(
    *, session: SessionDep, user_in: UserUpdateMe, current_user: CurrentUser
) -> Any:
    """
    Update own user.
    """

    if user_in.email:
        existing_user = crud.get_user_by_email(session=session, email=user_in.email)
        if existing_user and existing_user.id != current_user.id:
            raise HTTPException(
                status_code=409, detail="User with this email already exists"
            )
    user_data = user_in.model_dump(exclude_unset=True)
    current_user.sqlmodel_update(user_data)
    session.add(current_user)
    session.commit()
    session.refresh(current_user)
    return current_user


@router.patch("/me/password", response_model=Message)
def update_password_me(
    *, session: SessionDep, body: UpdatePassword, current_user: CurrentUser
) -> Any:
    """
    Update own password.
    """
    if not verify_password(body.current_password, current_user.hashed_password):
        raise HTTPException(status_code=400, detail="Incorrect password")
    if body.current_password == body.new_password:
        raise HTTPException(
            status_code=400, detail="New password cannot be the same as the current one"
        )
    hashed_password = get_password_hash(body.new_password)
    current_user.hashed_password = hashed_password
    session.add(current_user)
    session.commit()
    return Message(message="Password updated successfully")


@router.get("/me", response_model=UserPublic)
def read_user_me(current_user: CurrentUser) -> Any:
    """
    Get current user.
    """
    return current_user


@router.get("/me/permissions", response_model=MyPermissionsOut)
def read_my_permissions(session: SessionDep, current_user: CurrentUser) -> Any:
    """
    Get current user's permissions (from roles). Phase 2.
    """
    raw = get_my_permissions_flat(session, current_user.id)
    data = [
        PermissionItem(
            resource_type=item["resource_type"],
            action=item["action"],
            resource_id=item["resource_id"],
        )
        for item in raw
    ]
    return MyPermissionsOut(data=data)


@router.delete("/me", response_model=Message)
def delete_user_me(session: SessionDep, current_user: CurrentUser) -> Any:
    """
    Delete own user.
    """
    if current_user.is_superuser:
        raise HTTPException(
            status_code=403, detail="Super users are not allowed to delete themselves"
        )
    session.delete(current_user)
    session.commit()
    return Message(message="User deleted successfully")


@router.post("/signup", response_model=UserPublic)
def register_user(session: SessionDep, user_in: UserRegister) -> Any:
    """
    Create new user without the need to be logged in.
    """
    user = crud.get_user_by_email(session=session, email=user_in.email)
    if user:
        raise HTTPException(
            status_code=400,
            detail="The user with this email already exists in the system",
        )
    user_create = UserCreate.model_validate(user_in)
    user = crud.create_user(session=session, user_create=user_create)
    return user


@router.get("/{user_id}", response_model=UserPublic)
def read_user_by_id(
    user_id: uuid.UUID, session: SessionDep, current_user: CurrentUser
) -> Any:
    """
    Get a specific user by id. Allowed if viewing self, or superuser, or has user read permission.
    """
    user = session.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if user.id == current_user.id:
        return user
    if current_user.is_superuser:
        return user
    if has_permission(
        session, current_user, ResourceTypeEnum.USER, PermissionActionEnum.READ
    ):
        return user
    raise HTTPException(
        status_code=403,
        detail="The user doesn't have enough privileges",
    )


@router.patch(
    "/{user_id}",
    dependencies=[Depends(get_current_active_superuser)],
    response_model=UserPublic,
)
def update_user(
    *,
    session: SessionDep,
    user_id: uuid.UUID,
    user_in: UserUpdate,
) -> Any:
    """
    Update a user.
    """

    db_user = session.get(User, user_id)
    if not db_user:
        raise HTTPException(
            status_code=404,
            detail="The user with this id does not exist in the system",
        )
    if user_in.email:
        existing_user = crud.get_user_by_email(session=session, email=user_in.email)
        if existing_user and existing_user.id != user_id:
            raise HTTPException(
                status_code=409, detail="User with this email already exists"
            )

    db_user = crud.update_user(session=session, db_user=db_user, user_in=user_in)
    return db_user


@router.delete("/{user_id}", dependencies=[Depends(get_current_active_superuser)])
def delete_user(
    session: SessionDep, current_user: CurrentUser, user_id: uuid.UUID
) -> Message:
    """
    Delete a user.
    """
    user = session.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if user == current_user:
        raise HTTPException(
            status_code=403, detail="Super users are not allowed to delete themselves"
        )
    # Note: Item model removed - no need to delete related items
    session.delete(user)
    session.commit()
    return Message(message="User deleted successfully")


class UserRolesUpdateIn(BaseModel):
    """Body for PUT /users/{user_id}/roles. Replaces user's roles."""

    role_ids: list[uuid.UUID] = []


class UserRolesOut(BaseModel):
    """Response for GET/PUT /users/{user_id}/roles."""

    user_id: uuid.UUID
    role_ids: list[uuid.UUID]


@router.get(
    "/{user_id}/roles",
    dependencies=[Depends(get_current_active_superuser)],
    response_model=UserRolesOut,
)
def get_user_roles(
    session: SessionDep,
    current_user: CurrentUser,  # noqa: ARG001
    user_id: uuid.UUID,
) -> Any:
    """
    Get roles assigned to a user. Admin only.
    """
    user = session.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    stmt = select(UserRoleLink.role_id).where(UserRoleLink.user_id == user_id)
    role_ids = list(session.exec(stmt).all())
    return UserRolesOut(user_id=user_id, role_ids=role_ids)


@router.put(
    "/{user_id}/roles",
    dependencies=[Depends(get_current_active_superuser)],
    response_model=UserRolesOut,
)
def update_user_roles(
    session: SessionDep,
    current_user: CurrentUser,  # noqa: ARG001
    user_id: uuid.UUID,
    body: UserRolesUpdateIn,
) -> Any:
    """
    Assign roles to a user. Replaces existing role assignments. Admin only.
    """
    user = session.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    # Validate role_ids exist
    for rid in body.role_ids:
        if session.get(Role, rid) is None:
            raise HTTPException(
                status_code=400,
                detail=f"Role not found: {rid}",
            )
    session.exec(delete(UserRoleLink).where(UserRoleLink.user_id == user_id))
    for rid in body.role_ids:
        session.add(UserRoleLink(user_id=user_id, role_id=rid))
    session.commit()
    return UserRolesOut(user_id=user_id, role_ids=body.role_ids)
