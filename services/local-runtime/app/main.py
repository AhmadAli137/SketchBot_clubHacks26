from contextlib import asynccontextmanager
from pathlib import Path

from dotenv import load_dotenv

# Load .env from the service root (one level up from app/)
load_dotenv(Path(__file__).parents[1] / ".env")

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import api_router
from app.core.settings import settings
from app.core.state import app_state
from app.services import tutor_supabase_sync
from app.services.tutor_audit_log import start_supabase_outbox_worker


@asynccontextmanager
async def lifespan(_: FastAPI):
    if tutor_supabase_sync.is_configured():
        start_supabase_outbox_worker()
    yield


app = FastAPI(title="SketchBot Local Runtime", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_origin_regex=settings.cors_origin_regex,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router)


@app.get("/")
def root() -> dict:
    return {
        "name": "SketchBot Backend",
        "role": "local-runtime",
        "version": "0.1.0",
        "status": "ok",
        "robot_connected": app_state.robot_connected,
    }
