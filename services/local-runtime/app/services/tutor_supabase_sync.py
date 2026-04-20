"""
Push tutor audit rows to Supabase (PostgREST) when configured.

Uses the service role key on the local-runtime server only — never expose it
to clients. Set in .env:

  SUPABASE_URL=https://xxxx.supabase.co
  SUPABASE_SERVICE_ROLE_KEY=eyJ...

Optional:
  SUPABASE_SYNC_DISABLE=1   — never call the network (local SQLite audit only)

Env is read on each call (not only at import) so a restart picks up .env reliably
and load order cannot leave stale empty values.
"""

from __future__ import annotations

import logging
import os
from typing import Any

import httpx

logger = logging.getLogger("sketchbot.supabase")


def _sync_disabled() -> bool:
    return os.environ.get("SUPABASE_SYNC_DISABLE", "").strip().lower() in (
        "1",
        "true",
        "yes",
    )


def _supabase_url() -> str:
    return (os.environ.get("SUPABASE_URL") or "").strip().strip('"').strip("'").rstrip("/")


def _service_key() -> str:
    return (
        os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
        or os.environ.get("SUPABASE_SECRET_KEY")
        or ""
    ).strip().strip('"').strip("'")


def is_configured() -> bool:
    return bool(_supabase_url() and _service_key()) and not _sync_disabled()


def push_row(table: str, row: dict[str, Any]) -> bool:
    """Insert one row via PostgREST. Returns False if not configured or on HTTP/network error."""
    if not is_configured():
        return False
    base = _supabase_url()
    key = _service_key()
    url = f"{base}/rest/v1/{table}"
    headers = {
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
        "Accept": "application/json",
        "Prefer": "return=minimal",
    }
    try:
        with httpx.Client(timeout=httpx.Timeout(20.0, connect=8.0)) as client:
            r = client.post(url, json=row, headers=headers)
            if r.status_code in (200, 201, 204):
                return True
            body = (r.text or "")[:800]
            logger.warning(
                "Supabase insert failed: table=%s status=%s body=%s",
                table,
                r.status_code,
                body,
            )
            return False
    except httpx.HTTPError as exc:
        logger.warning("Supabase insert error: table=%s err=%s", table, exc)
        return False
