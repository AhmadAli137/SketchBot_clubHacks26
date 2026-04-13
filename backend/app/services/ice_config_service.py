from __future__ import annotations

import base64
import json
import threading
import time
from dataclasses import dataclass
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from app.core.settings import settings


@dataclass
class _CachedIceConfig:
    ice_servers: list[dict[str, object]]
    expires_at: float


class IceConfigService:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._cached_twilio: _CachedIceConfig | None = None

    def _normalize_ice_servers(self, value: object) -> list[dict[str, object]]:
        if not isinstance(value, list):
            return []

        normalized: list[dict[str, object]] = []
        for item in value:
            if not isinstance(item, dict):
                continue
            urls = item.get('urls')
            if isinstance(urls, str):
                normalized_urls: str | list[str] = urls
            elif isinstance(urls, list):
                cleaned = [str(entry).strip() for entry in urls if str(entry).strip()]
                if not cleaned:
                    continue
                normalized_urls = cleaned
            else:
                continue

            server: dict[str, object] = {'urls': normalized_urls}
            username = item.get('username')
            credential = item.get('credential')
            if isinstance(username, str) and username.strip():
                server['username'] = username.strip()
            if isinstance(credential, str) and credential.strip():
                server['credential'] = credential.strip()
            normalized.append(server)
        return normalized

    def _twilio_credentials_available(self) -> bool:
        return bool(
            settings.twilio_account_sid
            and settings.twilio_api_key
            and settings.twilio_api_secret
        )

    def _fetch_twilio_ice_servers(self) -> _CachedIceConfig:
        if not self._twilio_credentials_available():
            return _CachedIceConfig(ice_servers=settings.webrtc_ice_servers, expires_at=time.time() + 3600)

        account_sid = settings.twilio_account_sid or ''
        api_key = settings.twilio_api_key or ''
        api_secret = settings.twilio_api_secret or ''
        ttl = settings.twilio_token_ttl

        url = f'https://api.twilio.com/2010-04-01/Accounts/{account_sid}/Tokens.json'
        body = urlencode({'Ttl': str(ttl)}).encode('utf-8')
        auth = base64.b64encode(f'{api_key}:{api_secret}'.encode('utf-8')).decode('ascii')
        request = Request(
            url,
            data=body,
            headers={
                'Authorization': f'Basic {auth}',
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            method='POST',
        )

        try:
            with urlopen(request, timeout=10) as response:
                payload = json.loads(response.read().decode('utf-8'))
        except (HTTPError, URLError, TimeoutError, json.JSONDecodeError):
            return _CachedIceConfig(ice_servers=settings.webrtc_ice_servers, expires_at=time.time() + 300)

        ice_servers = self._normalize_ice_servers(payload.get('ice_servers') or payload.get('iceServers'))
        if not ice_servers:
            ice_servers = settings.webrtc_ice_servers

        expires_in = int(payload.get('ttl') or ttl)
        return _CachedIceConfig(
            ice_servers=ice_servers,
            expires_at=time.time() + max(60, expires_in - 60),
        )

    def get_ice_servers(self, *, force_refresh: bool = False) -> list[dict[str, object]]:
        if settings.webrtc_ice_provider != 'twilio':
            return settings.webrtc_ice_servers

        with self._lock:
            if (
                not force_refresh
                and self._cached_twilio is not None
                and self._cached_twilio.expires_at > time.time()
            ):
                return self._cached_twilio.ice_servers

            self._cached_twilio = self._fetch_twilio_ice_servers()
            return self._cached_twilio.ice_servers


ice_config_service = IceConfigService()
