"""Add committed_by_id to VersionCommit and published_version_id to ApiAssignment

Revision ID: add_version_management
Revises: dff873e8eedf
Create Date: 2026-01-28 12:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
import sqlmodel.sql.sqltypes

# revision identifiers, used by Alembic.
revision = 'add_version_management'
down_revision = 'dff873e8eedf'
branch_labels = None
depends_on = None


def upgrade():
    # Add committed_by_id to version_commit table
    op.add_column('version_commit', sa.Column('committed_by_id', sa.Uuid(), nullable=True))
    op.create_index(op.f('ix_version_commit_committed_by_id'), 'version_commit', ['committed_by_id'], unique=False)
    op.create_foreign_key(
        'fk_version_commit_committed_by_id_user',
        'version_commit', 'user',
        ['committed_by_id'], ['id'],
        ondelete='SET NULL'
    )
    
    # Add published_version_id to api_assignment table
    op.add_column('api_assignment', sa.Column('published_version_id', sa.Uuid(), nullable=True))
    op.create_index(op.f('ix_api_assignment_published_version_id'), 'api_assignment', ['published_version_id'], unique=False)
    op.create_foreign_key(
        'fk_api_assignment_published_version_id_version_commit',
        'api_assignment', 'version_commit',
        ['published_version_id'], ['id'],
        ondelete='SET NULL'
    )


def downgrade():
    # Remove published_version_id from api_assignment
    op.drop_constraint('fk_api_assignment_published_version_id_version_commit', 'api_assignment', type_='foreignkey')
    op.drop_index(op.f('ix_api_assignment_published_version_id'), table_name='api_assignment')
    op.drop_column('api_assignment', 'published_version_id')
    
    # Remove committed_by_id from version_commit
    op.drop_constraint('fk_version_commit_committed_by_id_user', 'version_commit', type_='foreignkey')
    op.drop_index(op.f('ix_version_commit_committed_by_id'), table_name='version_commit')
    op.drop_column('version_commit', 'committed_by_id')
