import os
from datetime import datetime, timedelta, timezone
import jwt
from passlib.context import CryptContext

# JWT
JWT_SECRET = os.environ.get("JWT_SECRET", "bossdental-dev-secret-change-me")
JWT_ALG = "HS256"
ACCESS_TOKEN_EXPIRES_HOURS = int(os.environ.get("ACCESS_TOKEN_EXPIRES_HOURS", "24"))
REFRESH_TOKEN_EXPIRES_DAYS = int(os.environ.get("REFRESH_TOKEN_EXPIRES_DAYS", "30"))

pwd_ctx = CryptContext(schemes=["bcrypt"], deprecated="auto")

def hash_password(plain: str) -> str:
    return pwd_ctx.hash(plain)

def verify_password(plain: str, hashed: str) -> bool:
    try:
        return pwd_ctx.verify(plain, hashed)
    except Exception:
        return False

def _create_token(sub: str, type_: str, expires_delta: timedelta) -> str:
    now = datetime.now(timezone.utc)
    payload = {"sub": sub, "type": type_, "iat": now, "exp": now + expires_delta}
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALG)

def create_access_token(user_id: str) -> str:
    return _create_token(user_id, "access", timedelta(hours=ACCESS_TOKEN_EXPIRES_HOURS))

def create_refresh_token(user_id: str) -> str:
    return _create_token(user_id, "refresh", timedelta(days=REFRESH_TOKEN_EXPIRES_DAYS))

def decode_token(token: str) -> dict:
    return jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALG])
