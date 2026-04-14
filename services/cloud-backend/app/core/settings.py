from __future__ import annotations

import os
from pathlib import Path


def _split_csv(value: str | None) -> list[str]:
    if not value:
        return []
    return [item.strip() for item in value.split(",") if item.strip()]


class Settings:
    def __init__(self) -> None:
        self.port = int(os.getenv("PORT", "8010"))
        self.cors_origins = _split_csv(
            os.getenv(
                "CLOUD_CORS_ORIGINS",
                "http://127.0.0.1:3002,http://localhost:3002",
            )
        )
        self.cors_origin_regex = os.getenv("CLOUD_CORS_ORIGIN_REGEX")
        self.data_file = Path(
            os.getenv(
                "SKETCHBOT_CLOUD_DATA_FILE",
                Path(__file__).resolve().parents[2] / "data" / "platform.json",
            )
        )


settings = Settings()
