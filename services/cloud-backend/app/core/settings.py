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
                "http://127.0.0.1:3001,http://localhost:3001,http://127.0.0.1:3002,http://localhost:3002",
            )
        )
        self.cors_origin_regex = os.getenv(
            "CLOUD_CORS_ORIGIN_REGEX",
            r"^https?://(localhost|127\.0\.0\.1)(:\d+)?$|^https://.*\.aibotics\.app$|^https://.*\.vercel\.app$|^app://localhost$",
        )
        self.data_file = Path(
            os.getenv(
                "SKETCHBOT_CLOUD_DATA_FILE",
                Path(__file__).resolve().parents[2] / "data" / "platform.json",
            )
        )
        # AI provider keys — live only on the cloud backend, never in the installer
        self.anthropic_api_key = os.getenv("ANTHROPIC_API_KEY", "")
        self.elevenlabs_api_key = os.getenv("ELEVENLABS_API_KEY", "")
        self.elevenlabs_model_id = os.getenv("ELEVENLABS_MODEL_ID", "eleven_turbo_v2_5")
        self.openai_api_key = os.getenv("OPENAI_API_KEY", "")

        # Supabase — used to validate user JWTs on every AI request
        self.supabase_url = os.getenv("SUPABASE_URL", "")
        self.supabase_service_role_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")

        # Set SKIP_AUTH=true in local dev to bypass JWT validation
        self.skip_auth = os.getenv("SKIP_AUTH", "").strip().lower() in ("1", "true", "yes")

        # Tutor agent persistence — when true, agent hypothesis + recent
        # event log are saved to Supabase after each think and restored
        # when a session reconnects after a deploy. Requires the
        # tutor_agent_state table (see scripts/supabase_tutor_agent_state.sql).
        # Default off so single-instance deployments without the table
        # don't error out.
        self.tutor_persist_enabled = (
            os.getenv("TUTOR_PERSIST_ENABLED", "").strip().lower() in ("1", "true", "yes")
        )

        # Stripe — payment processing (optional; paywall stubs work without it)
        self.stripe_secret_key = os.getenv("STRIPE_SECRET_KEY", "")
        self.stripe_webhook_secret = os.getenv("STRIPE_WEBHOOK_SECRET", "")
        self.stripe_price_home_monthly = os.getenv("STRIPE_PRICE_HOME_MONTHLY", "")
        self.stripe_price_home_annual = os.getenv("STRIPE_PRICE_HOME_ANNUAL", "")
        self.stripe_price_classroom_monthly = os.getenv("STRIPE_PRICE_CLASSROOM_MONTHLY", "")
        self.stripe_price_classroom_annual = os.getenv("STRIPE_PRICE_CLASSROOM_ANNUAL", "")
        self.stripe_price_school_monthly = os.getenv("STRIPE_PRICE_SCHOOL_MONTHLY", "")
        self.stripe_price_school_annual = os.getenv("STRIPE_PRICE_SCHOOL_ANNUAL", "")
        self.app_url = os.getenv("APP_URL", "https://aibotics.app")


settings = Settings()
