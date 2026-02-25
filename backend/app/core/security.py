import base64
import hashlib
import logging
from datetime import datetime, timedelta, timezone
from typing import Any

import jwt
from cryptography.fernet import Fernet, InvalidToken
from passlib.context import CryptContext

from app.core.config import settings

_logger = logging.getLogger(__name__)

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


ALGORITHM = "HS256"

# JWT token type claims to prevent cross-use between dashboard and gateway
TOKEN_TYPE_DASHBOARD = "dashboard"
TOKEN_TYPE_GATEWAY = "gateway"

# ---------------------------------------------------------------------------
# JWT helpers
# ---------------------------------------------------------------------------


def create_access_token(
    subject: str | Any,
    expires_delta: timedelta,
    token_type: str = TOKEN_TYPE_DASHBOARD,
) -> str:
    expire = datetime.now(timezone.utc) + expires_delta
    to_encode = {"exp": expire, "sub": str(subject), "type": token_type}
    encoded_jwt = jwt.encode(to_encode, settings.SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt


# ---------------------------------------------------------------------------
# Password hashing (bcrypt)
# ---------------------------------------------------------------------------


def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)


def get_password_hash(password: str) -> str:
    return pwd_context.hash(password)


# ---------------------------------------------------------------------------
# Symmetric encryption for sensitive fields (e.g. DataSource passwords)
# ---------------------------------------------------------------------------

_fernet: Fernet | None = None


def _get_fernet() -> Fernet:
    """Derive a Fernet key from SECRET_KEY (SHA-256 → 32 bytes → base64)."""
    global _fernet
    if _fernet is None:
        key_bytes = hashlib.sha256(settings.SECRET_KEY.encode()).digest()
        _fernet = Fernet(base64.urlsafe_b64encode(key_bytes))
    return _fernet


def encrypt_value(plain: str) -> str:
    """Encrypt a string value. Returns a Fernet token (starts with 'gAAAAA')."""
    if not plain:
        return plain
    return _get_fernet().encrypt(plain.encode()).decode()


def decrypt_value(encrypted: str) -> str:
    """Decrypt a Fernet-encrypted value.

    Raises ``InvalidToken`` if the value cannot be decrypted (no plain-text
    fallback — all stored passwords must be Fernet-encrypted).
    """
    if not encrypted:
        return encrypted
    return _get_fernet().decrypt(encrypted.encode()).decode()
