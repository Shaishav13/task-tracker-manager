import os
import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from dotenv import load_dotenv, find_dotenv
from sqlalchemy import text
from app.database import engine

load_dotenv(find_dotenv(), override=True)

JWT_SECRET = os.getenv("JWT_SECRET", "super_secret_jwt_key")
JWT_ALGORITHM = os.getenv("JWT_ALGORITHM", "HS256")

security = HTTPBearer()

# Cache role id → name to avoid hitting DB on every request
_role_cache: dict[str, str] = {}


def _get_role_name(role_id: str) -> str | None:
    """Look up role name by id, with simple in-memory cache."""
    if role_id in _role_cache:
        return _role_cache[role_id]
    with engine.connect() as conn:
        row = conn.execute(
            text('SELECT name FROM roles WHERE id = :rid'), {"rid": role_id}
        ).fetchone()
    if row:
        _role_cache[role_id] = row[0]
        return row[0]
    return None


def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)) -> dict:
    token = credentials.credentials
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials or token expired",
        headers={"WWW-Authenticate": "Bearer"},
    )

    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        user_id: str = payload.get("sub")
        email: str = payload.get("email")
        role_id: str = payload.get("roleId")

        if user_id is None or email is None:
            raise credentials_exception

        role_name = _get_role_name(role_id) if role_id else None

        return {
            "userId": user_id,
            "email": email,
            "roleId": role_id,
            "roleName": role_name,
        }
    except jwt.PyJWTError:
        raise credentials_exception