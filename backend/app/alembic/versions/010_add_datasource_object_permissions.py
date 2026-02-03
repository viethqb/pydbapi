"""Backfill datasource-scoped permissions for existing datasources."""

from __future__ import annotations

import uuid

import sqlalchemy as sa
from alembic import op

revision = "010_datasource_object_perms"
down_revision = "009_module_object_permissions"
branch_labels = None
depends_on = None

DATASOURCE_RESOURCE_TYPE = "datasource"
DATASOURCE_ACTIONS = ["read", "create", "update", "delete", "execute"]


def upgrade() -> None:
    bind = op.get_bind()
    datasource_ids = [
        row[0] for row in bind.execute(sa.text("SELECT id FROM datasource"))
    ]
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
    for ds_id in datasource_ids:
        for action in DATASOURCE_ACTIONS:
            bind.execute(
                insert_stmt,
                {
                    "id": str(uuid.uuid4()),
                    "resource_type": DATASOURCE_RESOURCE_TYPE,
                    "action": action,
                    "resource_id": str(ds_id),
                },
            )


def downgrade() -> None:
    bind = op.get_bind()
    bind.execute(
        sa.text(
            """
            DELETE FROM permission
            WHERE resource_type = :resource_type
              AND resource_id IS NOT NULL
            """
        ),
        {"resource_type": DATASOURCE_RESOURCE_TYPE},
    )
