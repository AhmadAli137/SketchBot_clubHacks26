from __future__ import annotations

import json
import os


def _split_csv(value: str | None) -> list[str]:
    if not value:
        return []
    return [item.strip() for item in value.split(",") if item.strip()]


def _default_ice_servers() -> list[dict[str, object]]:
    return [
        {
            "urls": [
                "stun:stun.l.google.com:19302",
                "stun:stun1.l.google.com:19302",
            ]
        }
    ]


def _normalize_ice_server(entry: object) -> dict[str, object] | None:
    if not isinstance(entry, dict):
        return None

    urls = entry.get("urls")
    normalized_urls: str | list[str] | None = None
    if isinstance(urls, str) and urls.strip():
        normalized_urls = urls.strip()
    elif isinstance(urls, list):
        values = [str(item).strip() for item in urls if str(item).strip()]
        if values:
            normalized_urls = values

    if not normalized_urls:
        return None

    normalized: dict[str, object] = {"urls": normalized_urls}
    username = entry.get("username")
    credential = entry.get("credential")
    if isinstance(username, str) and username.strip():
        normalized["username"] = username.strip()
    if isinstance(credential, str) and credential.strip():
        normalized["credential"] = credential.strip()
    return normalized


def _load_webrtc_ice_servers() -> list[dict[str, object]]:
    raw_json = os.getenv("WEBRTC_ICE_SERVERS_JSON")
    if raw_json:
        try:
            payload = json.loads(raw_json)
            items = payload if isinstance(payload, list) else [payload]
            normalized = [server for item in items if (server := _normalize_ice_server(item)) is not None]
            if normalized:
                return normalized
        except json.JSONDecodeError:
            pass

    stun_urls = _split_csv(os.getenv("WEBRTC_STUN_URLS")) or [
        "stun:stun.l.google.com:19302",
        "stun:stun1.l.google.com:19302",
    ]
    turn_urls = _split_csv(os.getenv("WEBRTC_TURN_URLS"))
    turn_username = os.getenv("WEBRTC_TURN_USERNAME")
    turn_credential = os.getenv("WEBRTC_TURN_CREDENTIAL")

    servers: list[dict[str, object]] = []
    if stun_urls:
        servers.append({"urls": stun_urls})
    if turn_urls:
        turn_server: dict[str, object] = {"urls": turn_urls}
        if turn_username:
            turn_server["username"] = turn_username
        if turn_credential:
            turn_server["credential"] = turn_credential
        servers.append(turn_server)

    return servers or _default_ice_servers()


class Settings:
    def __init__(self) -> None:
        self.port = int(os.getenv("PORT", "8000"))
        self.openai_api_key = os.getenv("OPENAI_API_KEY")
        self.cors_origins = _split_csv(
            os.getenv(
                "BACKEND_CORS_ORIGINS",
                "http://localhost:3001,http://127.0.0.1:3001",
            )
        )
        self.cors_origin_regex = os.getenv("BACKEND_CORS_ORIGIN_REGEX")
        self.webrtc_ice_provider = os.getenv("WEBRTC_ICE_PROVIDER", "static").strip().lower()
        self.webrtc_ice_servers = _load_webrtc_ice_servers()
        self.twilio_account_sid = os.getenv("TWILIO_ACCOUNT_SID")
        self.twilio_api_key = os.getenv("TWILIO_API_KEY")
        self.twilio_api_secret = os.getenv("TWILIO_API_SECRET")
        self.twilio_token_ttl = int(os.getenv("TWILIO_TOKEN_TTL", "3600"))


settings = Settings()
