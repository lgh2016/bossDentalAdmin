"""FastAPI entrypoint — Boss Dental Admin."""
import logging
import os
from pathlib import Path

from dotenv import load_dotenv
from fastapi import APIRouter, FastAPI
from starlette.middleware.cors import CORSMiddleware

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

# Importar routers después de cargar .env (los módulos usan os.environ en import-time)
from routers import (  # noqa: E402
    activity_logs as activity_logs_router,
    admin_doctors as admin_doctors_router,
    appointments as appointments_router,
    auth as auth_router,
    branches as branches_router,
    dashboard as dashboard_router,
    dentist as dentist_router,
    doctors as doctors_router,
    patients as patients_router,
    treatments as treatments_router,
)

app = FastAPI(title="Boss Dental API")

api_router = APIRouter(prefix="/api")
api_router.include_router(auth_router.router)
api_router.include_router(patients_router.router)
api_router.include_router(treatments_router.router)
api_router.include_router(appointments_router.router)
api_router.include_router(doctors_router.router)
api_router.include_router(branches_router.router)
api_router.include_router(dashboard_router.router)
api_router.include_router(activity_logs_router.router)
api_router.include_router(dentist_router.router)
api_router.include_router(admin_doctors_router.router)


@api_router.get("/health")
async def health():
    return {"status": "ok"}


app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get("CORS_ORIGINS", "*").split(","),
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)


@app.on_event("shutdown")
async def shutdown_db_client():
    from core.db import close

    close()
