from __future__ import annotations

from functools import lru_cache
from typing import Annotated

from fastapi import Depends, Header, HTTPException

from app.core.settings import settings


@lru_cache(maxsize=1)
def _supabase_client():
    """Lazy singleton — only instantiated when auth is actually needed."""
    if not settings.supabase_url or not settings.supabase_service_role_key:
        return None
    from supabase import create_client
    return create_client(settings.supabase_url, settings.supabase_service_role_key)


def require_auth(authorization: Annotated[str | None, Header()] = None) -> dict:
    """FastAPI dependency: validate Supabase JWT, return {id, email}.

    Set SKIP_AUTH=true on the server to bypass (local dev only — never in prod).
    """
    if settings.skip_auth:
        return {"id": "dev-user", "email": "dev@local"}

    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing auth token")

    token = authorization.removeprefix("Bearer ").strip()
    client = _supabase_client()
    if client is None:
        raise HTTPException(status_code=503, detail="Auth service not configured on this server")

    try:
        resp = client.auth.get_user(token)
        if not resp.user:
            raise HTTPException(status_code=401, detail="Invalid or expired token")
        return {"id": resp.user.id, "email": resp.user.email}
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
