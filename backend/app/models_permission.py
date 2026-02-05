"""
Permission models (Phase 1 – PERMISSION_PLAN_SUPERSET_STYLE).

Role, Permission, UserRoleLink, RolePermissionLink.
Resource types: datasource, module, group, api_assignment, macro_def, client, user.
Actions: read, create, update, delete.
"""

import uuid
from enum import Enum
from typing import TYPE_CHECKING

from sqlalchemy import Column, Enum as SQLEnum, ForeignKey, UniqueConstraint
from sqlmodel import Field, Relationship, SQLModel

if TYPE_CHECKING:
    from app.models import User


# ---------------------------------------------------------------------------
# Enums
# ---------------------------------------------------------------------------


class ResourceTypeEnum(str, Enum):
    """Resource types for permission scope."""

    DATASOURCE = "datasource"
    MODULE = "module"
    GROUP = "group"
    API_ASSIGNMENT = "api_assignment"
    MACRO_DEF = "macro_def"
    CLIENT = "client"
    USER = "user"
    OVERVIEW = "overview"
    ACCESS_LOG = "access_log"


class PermissionActionEnum(str, Enum):
    """Actions for permissions (CRUD + execute for test/debug)."""

    READ = "read"
    CREATE = "create"
    UPDATE = "update"
    DELETE = "delete"
    EXECUTE = "execute"  # run test/debug (e.g. datasource test, API debug)


# ---------------------------------------------------------------------------
# Link tables (many-to-many) – defined first for link_model refs
# ---------------------------------------------------------------------------


class UserRoleLink(SQLModel, table=True):
    """User <-> Role many-to-many."""

    __tablename__ = "user_role_link"
    __table_args__ = (UniqueConstraint("user_id", "role_id", name="uq_user_role"),)

    user_id: uuid.UUID = Field(foreign_key="user.id", primary_key=True)
    role_id: uuid.UUID = Field(foreign_key="role.id", primary_key=True)


class RolePermissionLink(SQLModel, table=True):
    """Role <-> Permission many-to-many."""

    __tablename__ = "role_permission_link"
    __table_args__ = (
        UniqueConstraint("role_id", "permission_id", name="uq_role_permission"),
    )

    role_id: uuid.UUID = Field(foreign_key="role.id", primary_key=True)
    permission_id: uuid.UUID = Field(foreign_key="permission.id", primary_key=True)


# ---------------------------------------------------------------------------
# Role
# ---------------------------------------------------------------------------


class Role(SQLModel, table=True):
    __tablename__ = "role"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    name: str = Field(max_length=64, unique=True, index=True)
    description: str | None = Field(default=None, max_length=255)

    # Many-to-many: query via RolePermissionLink / UserRoleLink (avoid link_model annotation issues)


# ---------------------------------------------------------------------------
# Permission
# ---------------------------------------------------------------------------


class Permission(SQLModel, table=True):
    __tablename__ = "permission"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    resource_type: ResourceTypeEnum = Field(
        sa_column=Column(
            SQLEnum(
                ResourceTypeEnum,
                name="resourcetypeenum",
                create_type=False,
                values_callable=lambda x: [e.value for e in x],
            ),
            nullable=False,
            index=True,
        )
    )
    action: PermissionActionEnum = Field(
        sa_column=Column(
            SQLEnum(
                PermissionActionEnum,
                name="permissionactionenum",
                create_type=False,
                values_callable=lambda x: [e.value for e in x],
            ),
            nullable=False,
            index=True,
        )
    )
    resource_id: uuid.UUID | None = Field(
        default=None,
        nullable=True,
        description="NULL = all resources of type, else specific resource UUID",
    )

    # Many-to-many: query via RolePermissionLink (avoid link_model annotation issues)
