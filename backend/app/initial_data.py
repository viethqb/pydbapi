"""Initial data: first superuser, roles, permissions, and assign Admin to superusers."""

import logging
import uuid

from sqlmodel import Session, select

from app.core.db import engine, init_db
from app.models import User
from app.models_permission import (
    Permission,
    PermissionActionEnum,
    ResourceTypeEnum,
    Role,
    RolePermissionLink,
    UserRoleLink,
)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Default roles (Superset-style)
ROLE_ADMIN = "Admin"
ROLE_ALPHA = "Alpha"
ROLE_GAMMA = "Gamma"
ROLE_OPERATOR = "Operator"

# All resource types and actions for full (Admin) permissions
RESOURCE_TYPES = list(ResourceTypeEnum)
ACTIONS = list(PermissionActionEnum)


def _get_or_create_role(
    session: Session, name: str, description: str | None = None
) -> Role:
    role = session.exec(select(Role).where(Role.name == name)).first()
    if role:
        return role
    role = Role(name=name, description=description)
    session.add(role)
    session.flush()
    logger.info("Created role: %s", name)
    return role


def _get_or_create_permission(
    session: Session,
    resource_type: ResourceTypeEnum,
    action: PermissionActionEnum,
    resource_id: uuid.UUID | None = None,
) -> Permission:
    perm = session.exec(
        select(Permission).where(
            Permission.resource_type == resource_type,
            Permission.action == action,
            Permission.resource_id == resource_id,
        )
    ).first()
    if perm:
        return perm
    perm = Permission(
        resource_type=resource_type,
        action=action,
        resource_id=resource_id,
    )
    session.add(perm)
    session.flush()
    return perm


def _link_role_permission(
    session: Session, role_id: uuid.UUID, permission_id: uuid.UUID
) -> None:
    existing = session.exec(
        select(RolePermissionLink).where(
            RolePermissionLink.role_id == role_id,
            RolePermissionLink.permission_id == permission_id,
        )
    ).first()
    if existing:
        return
    session.add(RolePermissionLink(role_id=role_id, permission_id=permission_id))


def _link_user_role(session: Session, user_id: uuid.UUID, role_id: uuid.UUID) -> None:
    existing = session.exec(
        select(UserRoleLink).where(
            UserRoleLink.user_id == user_id,
            UserRoleLink.role_id == role_id,
        )
    ).first()
    if existing:
        return
    session.add(UserRoleLink(user_id=user_id, role_id=role_id))


def seed_roles_and_permissions(session: Session) -> None:
    """Create default roles, permissions, and assign Admin to superusers."""
    # 1. Create all permissions (resource_type, action) with resource_id=NULL
    all_permissions: list[Permission] = []
    for rt in RESOURCE_TYPES:
        for action in ACTIONS:
            perm = _get_or_create_permission(session, rt, action)
            all_permissions.append(perm)

    # 2. Create roles
    admin_role = _get_or_create_role(
        session, ROLE_ADMIN, "Full access to all resources"
    )
    alpha_role = _get_or_create_role(
        session,
        ROLE_ALPHA,
        "Create/edit datasources, modules, APIs, clients; user read only",
    )
    gamma_role = _get_or_create_role(
        session, ROLE_GAMMA, "Read-only access to resources"
    )
    operator_role = _get_or_create_role(
        session, ROLE_OPERATOR, "Read API assignments and overview"
    )

    # 3. Admin: all permissions
    for perm in all_permissions:
        _link_role_permission(session, admin_role.id, perm.id)

    # 4. Alpha: datasource, module, group, api_assignment, macro_def, client: CRUD + execute; user: read; overview: read
    alpha_resource_types = [
        ResourceTypeEnum.DATASOURCE,
        ResourceTypeEnum.MODULE,
        ResourceTypeEnum.GROUP,
        ResourceTypeEnum.API_ASSIGNMENT,
        ResourceTypeEnum.MACRO_DEF,
        ResourceTypeEnum.CLIENT,
    ]
    alpha_perms = [
        p for p in all_permissions if p.resource_type in alpha_resource_types
    ]
    alpha_perms += [
        p
        for p in all_permissions
        if p.resource_type == ResourceTypeEnum.USER
        and p.action == PermissionActionEnum.READ
    ]
    alpha_perms += [
        p
        for p in all_permissions
        if p.resource_type == ResourceTypeEnum.OVERVIEW
        and p.action == PermissionActionEnum.READ
    ]
    alpha_perms += [
        p
        for p in all_permissions
        if p.resource_type == ResourceTypeEnum.ACCESS_LOG
        and p.action in (PermissionActionEnum.READ, PermissionActionEnum.UPDATE)
    ]
    for perm in alpha_perms:
        _link_role_permission(session, alpha_role.id, perm.id)

    # 5. Gamma: read only on datasource, module, group, api_assignment, macro_def, client, overview
    gamma_resource_types = [
        ResourceTypeEnum.DATASOURCE,
        ResourceTypeEnum.MODULE,
        ResourceTypeEnum.GROUP,
        ResourceTypeEnum.API_ASSIGNMENT,
        ResourceTypeEnum.MACRO_DEF,
        ResourceTypeEnum.CLIENT,
        ResourceTypeEnum.OVERVIEW,
        ResourceTypeEnum.ACCESS_LOG,
    ]
    gamma_perms = [
        p
        for p in all_permissions
        if p.resource_type in gamma_resource_types
        and p.action == PermissionActionEnum.READ
    ]
    for perm in gamma_perms:
        _link_role_permission(session, gamma_role.id, perm.id)

    # 6. Operator: api_assignment read + execute (debug), overview read, access_log read
    operator_perms = [
        p
        for p in all_permissions
        if (
            (
                p.resource_type == ResourceTypeEnum.API_ASSIGNMENT
                and p.action
                in (
                    PermissionActionEnum.READ,
                    PermissionActionEnum.EXECUTE,
                )
            )
            or (
                p.resource_type == ResourceTypeEnum.OVERVIEW
                and p.action == PermissionActionEnum.READ
            )
            or (
                p.resource_type == ResourceTypeEnum.ACCESS_LOG
                and p.action == PermissionActionEnum.READ
            )
        )
    ]
    for perm in operator_perms:
        _link_role_permission(session, operator_role.id, perm.id)

    # 7. Assign Admin role to all superusers
    superusers = session.exec(select(User).where(User.is_superuser)).all()
    for user in superusers:
        _link_user_role(session, user.id, admin_role.id)
        logger.info("Assigned Admin role to user: %s", user.email)

    logger.info("Roles and permissions seeded successfully")


def init() -> None:
    with Session(engine) as session:
        init_db(session)
        session.commit()
    # Seed roles/permissions in a separate transaction (tables must exist via migration 007)
    with Session(engine) as session:
        try:
            seed_roles_and_permissions(session)
            session.commit()
        except Exception as e:
            logger.warning(
                "Seed roles/permissions skipped (run migration 007 first?): %s",
                e,
            )
            session.rollback()


def main() -> None:
    logger.info("Creating initial data")
    init()
    logger.info("Initial data created")


if __name__ == "__main__":
    main()
