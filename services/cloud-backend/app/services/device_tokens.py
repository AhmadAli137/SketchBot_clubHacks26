"""
Per-device JWT issuance and verification.

Tokens are HS256 with DEVICE_JWT_SECRET (env). They identify a specific
device row from public.devices and are issued exactly once per call to
the issue endpoint — the plaintext token is shown to the user one time
and only the JTI lands in the database. To rotate, set token_revoked_at
on the old row and issue a new one with a fresh JTI; the WS auth path
(Phase 2c.2) rejects any token whose JTI doesn't match the live row.

The token's `sub` is the device id (UUID) — *not* the user id — so a
robot's identity is independent of which account currently owns it. If
ownership changes (rare), the new owner reissues and the old token is
revoked.
"""

from __future__ import annotations

import os
import secrets as _stdlib_secrets
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any

import jwt

from app.core.settings import settings

# Tokens are long-lived — devices are physical objects; a kid shouldn't
# have to re-provision their robot every week. 1 year is a reasonable
# tradeoff between forced rotation and friction. If a token leaks, the
# user can revoke from the admin web at any time.
_TOKEN_TTL = timedelta(days=365)

# In dev (skip_auth or no secret configured), fall back to a process-
# local random key. This means tokens issued before a restart won't
# verify after — which is the right behaviour for dev: prod must set
# DEVICE_JWT_SECRET explicitly.
_DEV_FALLBACK_SECRET = _stdlib_secrets.token_urlsafe(48)


def _signing_key() -> str:
    return settings.device_jwt_secret or _DEV_FALLBACK_SECRET


class IssuedToken:
    """Result of issuing a fresh device token."""

    __slots__ = ("token", "jti", "issued_at", "expires_at")

    def __init__(self, token: str, jti: str, issued_at: datetime, expires_at: datetime):
        self.token = token
        self.jti = jti
        self.issued_at = issued_at
        self.expires_at = expires_at


def issue(device_id: str, serial: str, user_id: str) -> IssuedToken:
    """Mint a new device JWT. Caller is responsible for persisting the JTI
    to public.devices and surfacing the plaintext token to the user once.
    """
    now = datetime.now(timezone.utc)
    exp = now + _TOKEN_TTL
    jti = str(uuid.uuid4())
    payload: dict[str, Any] = {
        "sub": device_id,
        "serial": serial,
        "user_id": user_id,
        "iat": int(now.timestamp()),
        "exp": int(exp.timestamp()),
        "jti": jti,
    }
    token = jwt.encode(payload, _signing_key(), algorithm="HS256")
    return IssuedToken(token=token, jti=jti, issued_at=now, expires_at=exp)


def verify(token: str) -> dict[str, Any]:
    """Decode and verify signature/expiry. Raises jwt.PyJWTError on
    failure. Does NOT check the JTI against the live row — callers must
    do that lookup themselves so revocation takes effect immediately.
    """
    return jwt.decode(token, _signing_key(), algorithms=["HS256"])


def is_secret_configured() -> bool:
    """True iff a stable signing key is set via env. Used by the issue
    endpoint to refuse to mint long-lived tokens in dev unless the
    operator has consciously set one — otherwise a restart silently
    invalidates every device the user has provisioned.
    """
    return bool(settings.device_jwt_secret) or settings.skip_auth
