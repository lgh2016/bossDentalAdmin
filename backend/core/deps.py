"""Dependencies de autenticación y autorización."""
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
import jwt as _jwt

from core.security import decode_token
from core.db import db

bearer = HTTPBearer(auto_error=True)

async def current_user(creds: HTTPAuthorizationCredentials = Depends(bearer)):
    try:
        payload = decode_token(creds.credentials)
    except _jwt.ExpiredSignatureError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token expirado")
    except Exception:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token inválido")

    if payload.get("type") != "access":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token inválido")

    user = await db.users.find_one({"id": payload["sub"]}, {"_id": 0, "passwordHash": 0})
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Usuario no existe")
    if user.get("active") is False:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Usuario inactivo")
    return user

def require_roles(*roles: str):
    async def _dep(user = Depends(current_user)):
        role_name = (user.get("role") or {}).get("name", "")
        if role_name not in roles:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="No autorizado para esta acción")
        return user
    return _dep


async def current_dentist(user = Depends(current_user)):
    """Devuelve (user, doctor) si el usuario es DENTIST con doctorId válido."""
    role_name = (user.get("role") or {}).get("name", "")
    if role_name != "DENTIST":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Sólo dentistas pueden acceder a esta vista")
    doctor_id = user.get("doctorId")
    if doctor_id is None:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Usuario dentista sin perfil de doctor asociado")
    doctor = await db.doctors.find_one({"id": doctor_id}, {"_id": 0})
    if not doctor:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Doctor asociado no encontrado")
    return user, doctor
