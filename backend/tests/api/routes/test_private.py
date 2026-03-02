from fastapi.testclient import TestClient
from sqlmodel import Session, select

from app.core.config import settings
from app.models import User


def test_create_user(
    client: TestClient, superuser_token_headers: dict[str, str], db: Session
) -> None:
    r = client.post(
        f"{settings.API_V1_STR}/private/users/",
        headers=superuser_token_headers,
        json={
            "username": "pollo_listo",
            "email": "pollo@listo.com",
            "password": "password123",
            "full_name": "Pollo Listo",
        },
    )

    assert r.status_code == 200

    data = r.json()

    user = db.exec(select(User).where(User.id == data["id"])).first()

    assert user
    assert user.username == "pollo_listo"
    assert user.full_name == "Pollo Listo"
