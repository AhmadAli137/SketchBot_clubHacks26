from __future__ import annotations

from pathlib import Path

from dotenv import load_dotenv

load_dotenv(Path(__file__).parents[1] / ".env")

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.platform import load_challenge_library, load_platform_data, load_robot_registry
from app.core.settings import settings
from app.routers import concepts, tutor

app = FastAPI(title="SketchBot Cloud Backend", version="0.2.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_origin_regex=settings.cors_origin_regex,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(concepts.router)
app.include_router(tutor.router)


@app.get("/")
def root() -> dict:
    return {
        "name": "SketchBot Cloud Backend",
        "version": "0.2.0",
        "status": "ok",
        "mode": "administrative",
        "data_file": str(settings.data_file),
    }


@app.get("/health")
def health() -> dict:
    platform = load_platform_data()
    support = platform.get("support", {})
    return {
        "status": "ok",
        "service": "cloud-backend",
        "support_status": support.get("status", "unknown"),
    }


@app.get("/api/public/site")
def public_site() -> dict:
    platform = load_platform_data()
    return platform["site"]


@app.get("/api/admin/summary")
def admin_summary() -> dict:
    platform = load_platform_data()
    return platform["summary"]


@app.get("/api/admin/releases")
def admin_releases() -> dict:
    platform = load_platform_data()
    return platform["releases"]


@app.get("/api/admin/support")
def admin_support() -> dict:
    platform = load_platform_data()
    return platform["support"]


@app.get("/api/releases/latest")
def latest_releases() -> dict:
    platform = load_platform_data()
    return platform["releases"]


@app.get("/api/platform/config")
def platform_config() -> dict:
    platform = load_platform_data()
    return {
        "site": platform["site"],
        "summary": platform["summary"],
        "support": platform["support"],
    }


@app.get("/api/robots")
def robot_registry() -> dict:
    """Return all registered robot definitions."""
    return load_robot_registry()


@app.get("/api/robots/{robot_id}")
def robot_detail(robot_id: str) -> dict:
    """Return a single robot definition by ID."""
    registry = load_robot_registry()
    for robot in registry.get("robots", []):
        if robot.get("id") == robot_id:
            return robot
    from fastapi import HTTPException
    raise HTTPException(status_code=404, detail=f"Robot '{robot_id}' not found")


@app.get("/api/challenges")
def challenge_library() -> dict:
    """Return all challenge packs."""
    return load_challenge_library()


@app.get("/api/challenges/{robot_id}")
def challenges_for_robot(robot_id: str) -> dict:
    """Return challenge packs for a specific robot."""
    library = load_challenge_library()
    packs = [p for p in library.get("packs", []) if p.get("robot_id") == robot_id]
    return {"packs": packs}
