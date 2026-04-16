from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from app.core.settings import settings

_DATA_DIR = Path(__file__).resolve().parents[2] / "data"


DEFAULT_PLATFORM_DATA: dict[str, Any] = {
    "site": {
        "brand": "SketchBot",
        "headline": "Desktop-first classroom robotics with cloud administration",
        "desktop_app": "SketchBot Desktop",
        "companion_app": "SketchBot Camera Buddy",
        "support_email": "support@sketchbot.example",
    },
    "summary": {
        "organization_count": 12,
        "desktop_channel": "stable",
        "companion_channel": "stable",
        "latest_desktop_version": "0.1.0",
        "latest_companion_version": "0.1.0",
        "support_status": "green",
    },
    "releases": {
        "desktop": {
            "version": "0.1.0",
            "channel": "stable",
            "published_at": "2026-04-14",
            "download_label": "Desktop installer",
        },
        "companion": {
            "version": "1.0.0",
            "channel": "stable",
            "published_at": "2026-04-14",
            "download_label": "Expo Camera Buddy",
        },
    },
    "support": {
        "status": "green",
        "message": "All platform systems are healthy.",
        "updated_at": "2026-04-14T12:00:00Z",
    },
}


def _deep_merge(base: dict[str, Any], overlay: dict[str, Any]) -> dict[str, Any]:
    merged = dict(base)
    for key, value in overlay.items():
        if isinstance(value, dict) and isinstance(merged.get(key), dict):
            merged[key] = _deep_merge(merged[key], value)
        else:
            merged[key] = value
    return merged


def _load_data_file(path: Path) -> dict[str, Any]:
    if not path.exists():
        return DEFAULT_PLATFORM_DATA

    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
        if not isinstance(payload, dict):
            return DEFAULT_PLATFORM_DATA
        return _deep_merge(DEFAULT_PLATFORM_DATA, payload)
    except (json.JSONDecodeError, OSError):
        return DEFAULT_PLATFORM_DATA


def load_platform_data() -> dict[str, Any]:
    return _load_data_file(settings.data_file)


def _load_json_file(path: Path, default: Any) -> Any:
    if not path.exists():
        return default
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return default


def load_robot_registry() -> dict[str, Any]:
    return _load_json_file(_DATA_DIR / "robots.json", {"robots": []})


def load_challenge_library() -> dict[str, Any]:
    return _load_json_file(_DATA_DIR / "challenges.json", {"packs": []})


def load_concept_catalog() -> list[dict[str, Any]]:
    return _load_json_file(_DATA_DIR / "concepts.json", [])
