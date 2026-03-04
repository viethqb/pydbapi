import base64
import hashlib
import logging
from datetime import UTC, datetime, timedelta
from typing import Any
from uuid import uuid4

import bcrypt as _bcrypt
import jwt
from cryptography.fernet import Fernet

# passlib 1.7.x reads bcrypt.__about__.__version__ which was removed in bcrypt 4.x.
# Patch it before passlib imports bcrypt so the "(trapped) error reading bcrypt version"
# warning is silenced.
if not hasattr(_bcrypt, "__about__"):
    _bcrypt.__about__ = type("about", (), {"__version__": _bcrypt.__version__})()

from passlib.context import CryptContext

from app.core.config import settings

_logger = logging.getLogger(__name__)

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


ALGORITHM = "HS256"

# JWT token type claims to prevent cross-use between dashboard, gateway, and password reset
TOKEN_TYPE_DASHBOARD = "dashboard"
TOKEN_TYPE_GATEWAY = "gateway"
TOKEN_TYPE_PASSWORD_RESET = "password_reset"

# Pre-computed bcrypt hash of a random string. Used as a dummy target for
# verify_password when the looked-up user/client does not exist, so that the
# endpoint always spends bcrypt time regardless — preventing timing-based
# enumeration of valid usernames or client IDs.
_DUMMY_HASH: str = pwd_context.hash("__constant_time_dummy__")

# ---------------------------------------------------------------------------
# JWT helpers
# ---------------------------------------------------------------------------


def create_access_token(
    subject: str | Any,
    expires_delta: timedelta,
    token_type: str = TOKEN_TYPE_DASHBOARD,
) -> str:
    expire = datetime.now(UTC) + expires_delta
    to_encode = {
        "exp": expire,
        "sub": str(subject),
        "type": token_type,
        "jti": str(uuid4()),
    }
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
    """Derive a Fernet key from ENCRYPTION_KEY (preferred) or SECRET_KEY.

    Using a dedicated ENCRYPTION_KEY is strongly recommended so that a
    compromised JWT signing key does not also expose encrypted credentials.
    """
    global _fernet
    if _fernet is None:
        source_key = settings.ENCRYPTION_KEY or settings.SECRET_KEY
        key_bytes = hashlib.sha256(source_key.encode()).digest()
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
