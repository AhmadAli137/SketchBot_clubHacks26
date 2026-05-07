-- Devices — bind a physical robot's per-unit serial to a Supabase user.
--
-- Apply once via Supabase SQL editor (Dashboard → SQL Editor → New query →
-- paste → Run). After this, the cloud-backend's /api/devices router can
-- claim, list, and unclaim devices for the authed user.
--
-- The serial is generated per-unit in firmware (firmware/src/device_id.cpp,
-- format SKETCH-XXXX-XXXX from the ESP32-C5 efuse MAC). Each serial can be
-- owned by exactly one account at a time — the UNIQUE constraint enforces
-- that, and the API returns a 409 on attempts to claim a serial already
-- bound to someone else.

CREATE TABLE IF NOT EXISTS public.devices (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  serial          TEXT NOT NULL UNIQUE,
  name            TEXT,
  registered_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at    TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS devices_user_id_idx
  ON public.devices(user_id);

CREATE INDEX IF NOT EXISTS devices_serial_idx
  ON public.devices(serial);

-- Server-only access. The cloud-backend uses the service-role key and
-- bypasses RLS; nothing else (anon, authenticated) gets to see this table
-- via PostgREST.
ALTER TABLE public.devices ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.devices FROM anon, authenticated;
