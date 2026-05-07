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
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  serial              TEXT NOT NULL UNIQUE,
  name                TEXT,
  registered_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at        TIMESTAMPTZ,

  -- Per-device JWT tracking. The token itself is shown to the user
  -- exactly once at issuance and never stored in plaintext anywhere
  -- (handle-once-or-lose-it). We store only the JTI so we can revoke
  -- a leaked token and reissue a fresh one. token_revoked_at is set
  -- when the user clicks "rotate" — incoming WS auth checks JTI match
  -- and rejects revoked tokens.
  token_jti           UUID,
  token_issued_at     TIMESTAMPTZ,
  token_revoked_at    TIMESTAMPTZ
);

-- For pre-2c.1 deploys that already created the table, add the new
-- columns idempotently. Safe to re-run.
ALTER TABLE public.devices ADD COLUMN IF NOT EXISTS token_jti        UUID;
ALTER TABLE public.devices ADD COLUMN IF NOT EXISTS token_issued_at  TIMESTAMPTZ;
ALTER TABLE public.devices ADD COLUMN IF NOT EXISTS token_revoked_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS devices_user_id_idx
  ON public.devices(user_id);

CREATE INDEX IF NOT EXISTS devices_serial_idx
  ON public.devices(serial);

-- Server-only access. The cloud-backend uses the service-role key and
-- bypasses RLS; nothing else (anon, authenticated) gets to see this table
-- via PostgREST.
ALTER TABLE public.devices ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.devices FROM anon, authenticated;
