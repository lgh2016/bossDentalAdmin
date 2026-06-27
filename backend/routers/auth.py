"""Auth — replica el contrato del backend Java de Boss Dental.
POST /auth/login           → { accessToken, refreshToken, user }
GET  /auth/me              → user
GET  /auth/validate        → { valid, email }
POST /auth/refresh         → { token, refreshToken }
"""
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, EmailStr
import jwt as _jwt

from core.db import db
from core.security import (
    verify_password, create_access_token, create_refresh_token, decode_token,
)
from core.deps import current_user

router = APIRouter(prefix="/auth", tags=["auth"])


class LoginIn(BaseModel):
    email: EmailStr
    password: str


class RefreshIn(BaseModel):
    refreshToken: str


def _serialize_user(u: dict) -> dict:
    return {
        "id": u["id"],
        "name": u.get("name", ""),
        "lastName": u.get("lastName", ""),
        "email": u.get("email", ""),
        "role": u.get("role"),
        "branch": u.get("branch"),
        "doctorId": u.get("doctorId"),
    }


@router.post("/login")
async def login(body: LoginIn):
    user = await db.users.find_one({"email": body.email.lower()}, {"_id": 0})
    if not user or not verify_password(body.password, user.get("passwordHash", "")):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Credenciales incorrectas")
    if user.get("active") is False:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Usuario inactivo")
    return {
        "accessToken": create_access_token(user["id"]),
        "refreshToken": create_refresh_token(user["id"]),
        "user": _serialize_user(user),
    }


@router.get("/me")
async def me(user = Depends(current_user)):
    return _serialize_user(user)


@router.get("/validate")
async def validate_get(user = Depends(current_user)):
    return {"valid": True, "email": user.get("email")}


@router.post("/validate")
async def validate_post(user = Depends(current_user)):
    return {"valid": True, "email": user.get("email")}


@router.post("/refresh")
async def refresh(body: RefreshIn):
    try:
        payload = decode_token(body.refreshToken)
    except _jwt.ExpiredSignatureError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Refresh expirado")
    except Exception:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Refresh inválido")
    if payload.get("type") != "refresh":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token inválido")
    user = await db.users.find_one({"id": payload["sub"]}, {"_id": 0})
    if not user or user.get("active") is False:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Usuario no encontrado")
    # El frontend acepta `accessToken` (futuro) y `token` (actual). Devolvemos ambos para compatibilidad.
    new_access = create_access_token(user["id"])
    new_refresh = create_refresh_token(user["id"])
    return {"accessToken": new_access, "token": new_access, "refreshToken": new_refresh}
