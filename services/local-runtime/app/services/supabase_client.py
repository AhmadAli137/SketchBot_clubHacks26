"""
General-purpose PostgREST helpers for Supabase.

Follows the same credential pattern as tutor_supabase_sync.py.
Uses service role key — server-side only.
"""

from __future__ import annotations

import logging
from typing import Any

import httpx

from app.services.tutor_supabase_sync import _service_key, _supabase_url, is_configured

logger = logging.getLogger("sketchbot.supabase_client")

_TIMEOUT = httpx.Timeout(20.0, connect=8.0)


def _headers() -> dict[str, str]:
    key = _service_key()
    return {
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
        "Accept": "application/json",
    }


def get_rows(table: str, params: dict[str, str] | None = None) -> list[dict[str, Any]] | None:
    """
    GET rows from a table.  params are PostgREST filter strings, e.g.
    {"join_code": "eq.ABC123", "status": "eq.live"}.
    Returns None on error or when Supabase is not configured.
    """
    if not is_configured():
        return None
    url = f"{_supabase_url()}/rest/v1/{table}"
    try:
        with httpx.Client(timeout=_TIMEOUT) as client:
            r = client.get(url, headers=_headers(), params=params or {})
            if r.status_code == 200:
                return r.json()
            logger.warning("Supabase GET failed: table=%s status=%s", table, r.status_code)
            return None
    except httpx.HTTPError as exc:
        logger.warning("Supabase GET error: table=%s err=%s", table, exc)
        return None


def push_row(table: str, row: dict[str, Any]) -> dict[str, Any] | None:
    """
    INSERT a row. Returns the created row (with generated id) or None on failure.
    """
    if not is_configured():
        return None
    url = f"{_supabase_url()}/rest/v1/{table}"
    headers = {**_headers(), "Prefer": "return=representation"}
    try:
        with httpx.Client(timeout=_TIMEOUT) as client:
            r = client.post(url, json=row, headers=headers)
            if r.status_code in (200, 201):
                data = r.json()
                return data[0] if isinstance(data, list) and data else data
            logger.warning(
                "Supabase INSERT failed: table=%s status=%s body=%s",
                table, r.status_code, r.text[:400],
            )
            return None
    except httpx.HTTPError as exc:
        logger.warning("Supabase INSERT error: table=%s err=%s", table, exc)
        return None


def patch_rows(
    table: str,
    filters: dict[str, str],
    updates: dict[str, Any],
) -> bool:
    """
    PATCH rows matching filters. filters use PostgREST format {"col": "eq.value"}.
    """
    if not is_configured():
        return False
    url = f"{_supabase_url()}/rest/v1/{table}"
    headers = {**_headers(), "Prefer": "return=minimal"}
    try:
        with httpx.Client(timeout=_TIMEOUT) as client:
            r = client.patch(url, json=updates, headers=headers, params=filters)
            return r.status_code in (200, 204)
    except httpx.HTTPError as exc:
        logger.warning("Supabase PATCH error: table=%s err=%s", table, exc)
        return False
