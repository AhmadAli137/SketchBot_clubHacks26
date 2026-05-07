"""
Devices router — bind a physical robot's per-unit serial to the authed user.

Backed by the `public.devices` table created in
scripts/supabase_devices.sql. Serials are produced by firmware
(firmware/src/device_id.cpp) from the ESP32-C5 efuse MAC; format
SKETCH-XXXX-XXXX. Each serial can be claimed by exactly one account at a
time — the table's UNIQUE constraint enforces it and we surface that as
a 409 on collision.
"""

from __future__ import annotations

import re
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, field_validator

from app.auth import require_auth
from app.core.settings import settings

router = APIRouter(prefix="/api/devices", tags=["devices"])

# Serials are emitted by firmware as SKETCH-XXXX-XXXX (uppercase hex). We
# accept lowercase too and normalise on the way in so a kid copying off
# a sticker isn't tripped by case.
_SERIAL_RE = re.compile(r"^SKETCH-[0-9A-F]{4}-[0-9A-F]{4}$")


def _supabase():
    from app.auth import _supabase_client
    client = _supabase_client()
    if client is None:
        raise HTTPException(status_code=503, detail="Database not configured")
    return client


def _normalise_serial(raw: str) -> str:
    serial = (raw or "").strip().upper()
    if not _SERIAL_RE.match(serial):
        raise HTTPException(
            status_code=400,
            detail="Serial must look like SKETCH-XXXX-XXXX (hex)",
        )
    return serial


class Device(BaseModel):
    id: str
    serial: str
    name: str | None = None
    registered_at: str
    last_seen_at: str | None = None


class DeviceListResponse(BaseModel):
    devices: list[Device]


class ClaimRequest(BaseModel):
    serial: str
    name: str | None = None

    @field_validator("name")
    @classmethod
    def _trim_name(cls, v: str | None) -> str | None:
        if v is None:
            return None
        v = v.strip()
        return v[:80] if v else None


@router.get("", response_model=DeviceListResponse)
def list_devices(user: Annotated[dict, Depends(require_auth)]) -> DeviceListResponse:
    """Return all robots the authed user has claimed, newest first."""
    if settings.skip_auth:
        return DeviceListResponse(devices=[])

    client = _supabase()
    resp = (
        client.table("devices")
        .select("id, serial, name, registered_at, last_seen_at")
        .eq("user_id", user["id"])
        .order("registered_at", desc=True)
        .execute()
    )
    rows = resp.data or []
    return DeviceListResponse(devices=[Device(**row) for row in rows])


@router.post("", response_model=Device, status_code=201)
def claim_device(
    body: ClaimRequest,
    user: Annotated[dict, Depends(require_auth)],
) -> Device:
    """Claim a serial for the authed user. 409 if already owned by someone else."""
    serial = _normalise_serial(body.serial)

    if settings.skip_auth:
        # Dev-mode short circuit so the admin web claim form works locally.
        return Device(
            id="dev-" + serial,
            serial=serial,
            name=body.name,
            registered_at="1970-01-01T00:00:00Z",
            last_seen_at=None,
        )

    client = _supabase()

    existing = (
        client.table("devices")
        .select("id, user_id")
        .eq("serial", serial)
        .maybe_single()
        .execute()
    )
    if existing is not None and existing.data:
        if existing.data["user_id"] == user["id"]:
            # Idempotent re-claim by same owner — return the existing row.
            row = (
                client.table("devices")
                .select("id, serial, name, registered_at, last_seen_at")
                .eq("id", existing.data["id"])
                .single()
                .execute()
            )
            return Device(**row.data)
        raise HTTPException(
            status_code=409,
            detail="This robot is already registered to another account.",
        )

    insert = (
        client.table("devices")
        .insert({"user_id": user["id"], "serial": serial, "name": body.name})
        .execute()
    )
    row = insert.data[0] if insert.data else None
    if row is None:
        raise HTTPException(status_code=500, detail="Failed to register device")
    return Device(**{
        "id": row["id"],
        "serial": row["serial"],
        "name": row.get("name"),
        "registered_at": row["registered_at"],
        "last_seen_at": row.get("last_seen_at"),
    })


@router.delete("/{device_id}", status_code=204)
def unclaim_device(
    device_id: str,
    user: Annotated[dict, Depends(require_auth)],
) -> None:
    """Release a robot the authed user owns. 404 if not theirs (or not found)."""
    if settings.skip_auth:
        return

    client = _supabase()
    resp = (
        client.table("devices")
        .delete()
        .eq("id", device_id)
        .eq("user_id", user["id"])
        .execute()
    )
    if not resp.data:
        raise HTTPException(status_code=404, detail="Device not found")
