"""Initial data: first superuser, roles, permissions, and assign Admin to superusers."""

import logging
import uuid

from sqlmodel import Session, delete, select

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

# Fixed roles
ROLE_ADMIN = "Admin"
ROLE_DEV = "Dev"
ROLE_VIEWER = "Viewer"

# Legacy roles to clean up
_LEGACY_ROLES = ("Alpha", "Gamma", "Operator")

# Only seed global permissions that are actually enforced in routes.
# fmt: off
_ENFORCED_PERMISSIONS: list[tuple[ResourceTypeEnum, PermissionActionEnum]] = [
    (ResourceTypeEnum.DATASOURCE,      PermissionActionEnum.READ),
    (ResourceTypeEnum.DATASOURCE,      PermissionActionEnum.CREATE),
    (ResourceTypeEnum.DATASOURCE,      PermissionActionEnum.UPDATE),
    (ResourceTypeEnum.DATASOURCE,      PermissionActionEnum.DELETE),
    (ResourceTypeEnum.DATASOURCE,      PermissionActionEnum.EXECUTE),
    (ResourceTypeEnum.MODULE,          PermissionActionEnum.READ),
    (ResourceTypeEnum.MODULE,          PermissionActionEnum.CREATE),
    (ResourceTypeEnum.MODULE,          PermissionActionEnum.UPDATE),
    (ResourceTypeEnum.MODULE,          PermissionActionEnum.DELETE),
    (ResourceTypeEnum.GROUP,           PermissionActionEnum.READ),
    (ResourceTypeEnum.GROUP,           PermissionActionEnum.CREATE),
    (ResourceTypeEnum.GROUP,           PermissionActionEnum.UPDATE),
    (ResourceTypeEnum.GROUP,           PermissionActionEnum.DELETE),
    (ResourceTypeEnum.API_ASSIGNMENT,  PermissionActionEnum.READ),
    (ResourceTypeEnum.API_ASSIGNMENT,  PermissionActionEnum.CREATE),
    (ResourceTypeEnum.API_ASSIGNMENT,  PermissionActionEnum.UPDATE),
    (ResourceTypeEnum.API_ASSIGNMENT,  PermissionActionEnum.DELETE),
    (ResourceTypeEnum.API_ASSIGNMENT,  PermissionActionEnum.EXECUTE),
    (ResourceTypeEnum.MACRO_DEF,       PermissionActionEnum.READ),
    (ResourceTypeEnum.MACRO_DEF,       PermissionActionEnum.CREATE),
    (ResourceTypeEnum.MACRO_DEF,       PermissionActionEnum.UPDATE),
    (ResourceTypeEnum.MACRO_DEF,       PermissionActionEnum.DELETE),
    (ResourceTypeEnum.CLIENT,          PermissionActionEnum.READ),
    (ResourceTypeEnum.CLIENT,          PermissionActionEnum.CREATE),
    (ResourceTypeEnum.CLIENT,          PermissionActionEnum.UPDATE),
    (ResourceTypeEnum.CLIENT,          PermissionActionEnum.DELETE),
    (ResourceTypeEnum.OVERVIEW,        PermissionActionEnum.READ),
    (ResourceTypeEnum.ACCESS_LOG,      PermissionActionEnum.READ),
    (ResourceTypeEnum.ACCESS_LOG,      PermissionActionEnum.UPDATE),
]
# fmt: on
_ENFORCED_SET = set(_ENFORCED_PERMISSIONS)


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


def _cleanup_legacy_roles(session: Session) -> None:
    """Remove legacy roles (Alpha, Gamma, Operator) and their link entries."""
    for name in _LEGACY_ROLES:
        role = session.exec(select(Role).where(Role.name == name)).first()
        if not role:
            continue
        session.exec(delete(UserRoleLink).where(UserRoleLink.role_id == role.id))
        session.exec(
            delete(RolePermissionLink).where(RolePermissionLink.role_id == role.id)
        )
        session.delete(role)
        logger.info("Removed legacy role: %s", name)


def _cleanup_unenforced_global_permissions(session: Session) -> None:
    """Delete global permissions (resource_id IS NULL) not in _ENFORCED_SET."""
    global_perms = session.exec(
        select(Permission).where(Permission.resource_id.is_(None))  # type: ignore[union-attr]
    ).all()
    for perm in global_perms:
        if (perm.resource_type, perm.action) not in _ENFORCED_SET:
            session.exec(
                delete(RolePermissionLink).where(
                    RolePermissionLink.permission_id == perm.id
                )
            )
            session.delete(perm)
            logger.info(
                "Removed unenforced global permission: %s:%s",
                perm.resource_type,
                perm.action,
            )


# Scoped (resource_type, action) combos that are actually created by routes.
# Any scoped permission outside this set is orphaned clutter.
_VALID_SCOPED_ACTIONS: dict[ResourceTypeEnum, set[PermissionActionEnum]] = {
    ResourceTypeEnum.DATASOURCE: {
        PermissionActionEnum.READ,
        PermissionActionEnum.CREATE,
        PermissionActionEnum.UPDATE,
        PermissionActionEnum.DELETE,
        PermissionActionEnum.EXECUTE,
    },
    ResourceTypeEnum.MODULE: {
        PermissionActionEnum.READ,
        PermissionActionEnum.CREATE,
        PermissionActionEnum.UPDATE,
        PermissionActionEnum.DELETE,
    },
    ResourceTypeEnum.GROUP: {
        PermissionActionEnum.READ,
        PermissionActionEnum.CREATE,
        PermissionActionEnum.UPDATE,
        PermissionActionEnum.DELETE,
    },
    ResourceTypeEnum.API_ASSIGNMENT: {
        PermissionActionEnum.READ,
        PermissionActionEnum.CREATE,
        PermissionActionEnum.UPDATE,
        PermissionActionEnum.DELETE,
        PermissionActionEnum.EXECUTE,
    },
    ResourceTypeEnum.MACRO_DEF: {
        PermissionActionEnum.READ,
        PermissionActionEnum.CREATE,
        PermissionActionEnum.UPDATE,
        PermissionActionEnum.DELETE,
    },
    ResourceTypeEnum.CLIENT: {
        PermissionActionEnum.READ,
        PermissionActionEnum.CREATE,
        PermissionActionEnum.UPDATE,
        PermissionActionEnum.DELETE,
    },
}


def _cleanup_orphaned_scoped_permissions(session: Session) -> None:
    """Delete scoped permissions (resource_id IS NOT NULL) with invalid action for their type."""
    scoped_perms = session.exec(
        select(Permission).where(Permission.resource_id.is_not(None))  # type: ignore[union-attr]
    ).all()
    for perm in scoped_perms:
        valid = _VALID_SCOPED_ACTIONS.get(perm.resource_type)
        if valid is not None and perm.action not in valid:
            session.exec(
                delete(RolePermissionLink).where(
                    RolePermissionLink.permission_id == perm.id
                )
            )
            session.delete(perm)
            logger.info(
                "Removed orphaned scoped permission: %s:%s (resource_id=%s)",
                perm.resource_type,
                perm.action,
                perm.resource_id,
            )


# Dev: all enforced permissions except DELETE on any resource and all CLIENT permissions
_DEV_EXCLUDED = {
    (rt, PermissionActionEnum.DELETE) for rt, _ in _ENFORCED_PERMISSIONS
} | {(ResourceTypeEnum.CLIENT, action) for action in PermissionActionEnum}

# Viewer: read-only on all resources
_VIEWER_ACTIONS = {PermissionActionEnum.READ}


def seed_roles_and_permissions(session: Session) -> None:
    """Create Admin/Dev/Viewer roles, enforced permissions, and assign Admin to superusers."""
    # 0. Clean up legacy roles, unenforced global permissions, and orphaned scoped permissions
    _cleanup_legacy_roles(session)
    _cleanup_unenforced_global_permissions(session)
    _cleanup_orphaned_scoped_permissions(session)

    # 1. Create only enforced global permissions
    all_permissions: list[Permission] = []
    for rt, action in _ENFORCED_PERMISSIONS:
        perm = _get_or_create_permission(session, rt, action)
        all_permissions.append(perm)

    # 2. Create roles
    admin_role = _get_or_create_role(
        session, ROLE_ADMIN, "Full access to all resources"
    )
    dev_role = _get_or_create_role(
        session,
        ROLE_DEV,
        "All permissions except delete and client management",
    )
    viewer_role = _get_or_create_role(
        session, ROLE_VIEWER, "Read-only access to all resources"
    )

    # 3. Admin: all enforced permissions
    for perm in all_permissions:
        _link_role_permission(session, admin_role.id, perm.id)

    # 4. Dev: all enforced permissions except DELETE on any resource and all CLIENT
    for perm in all_permissions:
        if (perm.resource_type, perm.action) not in _DEV_EXCLUDED:
            _link_role_permission(session, dev_role.id, perm.id)

    # 5. Viewer: read-only on all resources
    for perm in all_permissions:
        if perm.action in _VIEWER_ACTIONS:
            _link_role_permission(session, viewer_role.id, perm.id)

    # 6. Assign Admin role to all superusers
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
