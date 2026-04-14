from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.platform import load_platform_data
from app.core.settings import settings

app = FastAPI(title="SketchBot Cloud Backend", version="0.2.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_origin_regex=settings.cors_origin_regex,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


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
