from collections.abc import Generator
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session, delete

from app.core.config import settings
from app.core.db import engine, init_db
from app.main import app
from app.models import User
from app.models_dbapi import (
    AccessLogConfig,
    AccessRecord,
    ApiGroup,
    ApiMacroDef,
    ApiModule,
    AppClient,
    DataSource,
    MacroDefVersionCommit,
)
from app.models_permission import Role, RolePermissionLink, UserRoleLink
from tests.utils.user import authentication_token_from_username
from tests.utils.utils import get_superuser_token_headers


@pytest.fixture(scope="session", autouse=True)
def _disable_rate_limiting():
    """Disable rate limiting during tests so login calls don't get 429."""
    with patch.object(settings, "FLOW_CONTROL_RATE_LIMIT_ENABLED", False):
        yield


@pytest.fixture(scope="session", autouse=True)
def db() -> Generator[Session, None, None]:
    with Session(engine) as session:
        init_db(session)
        yield session
        # Teardown in FK-aware order (children first)
        for model in (
            AccessRecord,
            AccessLogConfig,
            MacroDefVersionCommit,
            ApiMacroDef,
            UserRoleLink,
            RolePermissionLink,
            User,
            DataSource,
            ApiModule,
            ApiGroup,
            AppClient,
        ):
            session.execute(delete(model))
        session.commit()


@pytest.fixture(scope="module")
def client() -> Generator[TestClient, None, None]:
    with TestClient(app) as c:
        yield c


@pytest.fixture(scope="module")
def superuser_token_headers(client: TestClient) -> dict[str, str]:
    return get_superuser_token_headers(client)


@pytest.fixture(scope="module")
def normal_user_token_headers(client: TestClient, db: Session) -> dict[str, str]:
    return authentication_token_from_username(
        client=client, username=settings.TEST_USER, db=db
    )
