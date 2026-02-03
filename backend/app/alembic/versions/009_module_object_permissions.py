"""Add module-scoped permissions and unique constraint."""

from __future__ import annotations

import uuid

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision = "009_module_object_permissions"
down_revision = "008_execute_action"
branch_labels = None
depends_on = None


PERMISSION_UNIQUE_NAME = "uq_permission_resource_action_scope"
MODULE_RESOURCE_TYPE = "module"
MODULE_ACTIONS = ["read", "create", "update", "delete", "execute"]


def upgrade() -> None:
    op.create_unique_constraint(
        PERMISSION_UNIQUE_NAME,
        "permission",
        ["resource_type", "action", "resource_id"],
    )

    bind = op.get_bind()

    module_ids = [row[0] for row in bind.execute(sa.text("SELECT id FROM api_module"))]
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
    for module_id in module_ids:
        for action in MODULE_ACTIONS:
            bind.execute(
                insert_stmt,
                {
                    "id": str(uuid.uuid4()),
                    "resource_type": MODULE_RESOURCE_TYPE,
                    "action": action,
                    "resource_id": str(module_id),
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
        {"resource_type": MODULE_RESOURCE_TYPE},
    )
    op.drop_constraint(PERMISSION_UNIQUE_NAME, "permission", type_="unique")
