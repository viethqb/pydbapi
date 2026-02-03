"""Backfill object-level permissions for api_assignment, api_group, api_macro_def, app_client."""

from __future__ import annotations

import uuid

import sqlalchemy as sa
from alembic import op

revision = "011_obj_perms_agmc"
down_revision = "010_datasource_object_perms"
branch_labels = None
depends_on = None

RESOURCES = [
    (
        "api_assignment",
        "api_assignment",
        ["read", "create", "update", "delete", "execute"],
    ),
    ("api_group", "api_group", ["read", "create", "update", "delete"]),
    ("api_macro_def", "api_macro_def", ["read", "create", "update", "delete"]),
    ("app_client", "app_client", ["read", "create", "update", "delete"]),
]


def upgrade() -> None:
    bind = op.get_bind()
    insert_stmt = sa.text(
        """
        INSERT INTO permission (id, resource_type, action, resource_id)
        SELECT :id, :resource_type, :action, :resource_id
        WHERE NOT EXISTS (
            SELECT 1
            FROM permission
            WHERE resource_type = :resource_type
              AND action = :action
              AND resource_id = :resource_id
        )
        """
    )
    for table_name, resource_type, actions in RESOURCES:
        rows = bind.execute(sa.text(f"SELECT id FROM {table_name}")).fetchall()
        for (rid,) in rows:
            for action in actions:
                bind.execute(
                    insert_stmt,
                    {
                        "id": str(uuid.uuid4()),
                        "resource_type": resource_type,
                        "action": action,
                        "resource_id": str(rid),
                    },
                )


def downgrade() -> None:
    bind = op.get_bind()
    for _table_name, resource_type, _actions in RESOURCES:
        bind.execute(
            sa.text(
                """
                DELETE FROM permission
                WHERE resource_type = :resource_type
                  AND resource_id IS NOT NULL
                """
            ),
            {"resource_type": resource_type},
        )
