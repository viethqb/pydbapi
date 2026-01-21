"""Test helpers for DataSource."""

from sqlmodel import Session

from app.core.config import settings
from app.models_dbapi import DataSource, ProductTypeEnum
from tests.utils.utils import random_lower_string


def create_random_datasource(
    db: Session,
    *,
    name: str | None = None,
    product_type: ProductTypeEnum = ProductTypeEnum.POSTGRES,
    host: str | None = None,
    port: int | None = None,
    database: str | None = None,
    username: str | None = None,
    password: str | None = None,
    is_active: bool = True,
) -> DataSource:
    """Create a DataSource in the DB. Uses app Postgres settings by default so test/test and preTest can connect."""
    ds = DataSource(
        name=name or f"ds-{random_lower_string()}",
        product_type=product_type,
        host=host or settings.POSTGRES_SERVER,
        port=port or settings.POSTGRES_PORT,
        database=database or settings.POSTGRES_DB,
        username=username or settings.POSTGRES_USER,
        password=password or settings.POSTGRES_PASSWORD,
        is_active=is_active,
    )
    db.add(ds)
    db.commit()
    db.refresh(ds)
    return ds
