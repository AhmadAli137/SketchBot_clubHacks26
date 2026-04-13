from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import api_router
from app.core.settings import settings
from app.core.state import app_state


@asynccontextmanager
async def lifespan(_: FastAPI):
    yield


app = FastAPI(title="SketchBot Backend", version="0.1.0", lifespan=lifespan)

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
        "version": "0.1.0",
        "status": "ok",
        "robot_connected": app_state.robot_connected,
    }
