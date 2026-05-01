-- Tutor agent state — Supabase-backed persistence for the per-session
-- TutorAgent. Lets the agent's working-memory hypothesis and recent
-- event log survive cloud-backend restarts and Render redeploys.
--
-- Apply this once via Supabase SQL editor (Dashboard → SQL Editor → New
-- query → paste → Run) before setting TUTOR_PERSIST_ENABLED=true on
-- the cloud-backend service.
--
-- The table is server-only — accessed exclusively via the service-role
-- key from the cloud-backend. RLS is enabled with no policies, plus
-- the schema-level grants are revoked, so PostgREST cannot expose any
-- of these rows even if a misconfigured anon/authenticated client tries.

CREATE TABLE IF NOT EXISTS public.tutor_agent_state (
  session_id          TEXT PRIMARY KEY,
  user_id             UUID,
  identity            JSONB NOT NULL,
  hypothesis          TEXT,
  event_log           JSONB NOT NULL DEFAULT '[]'::jsonb,
  last_speak_ts       DOUBLE PRECISION,
  last_think_at       DOUBLE PRECISION,
  last_next_check_sec DOUBLE PRECISION,
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at          TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '24 hours')
);

CREATE INDEX IF NOT EXISTS tutor_agent_state_user_id_idx
  ON public.tutor_agent_state(user_id);

CREATE INDEX IF NOT EXISTS tutor_agent_state_expires_at_idx
  ON public.tutor_agent_state(expires_at);

-- Updated-at trigger so the column tracks the last write automatically.
CREATE OR REPLACE FUNCTION public.tutor_agent_state_touch_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tutor_agent_state_touch_updated_at_trigger
  ON public.tutor_agent_state;
CREATE TRIGGER tutor_agent_state_touch_updated_at_trigger
  BEFORE UPDATE ON public.tutor_agent_state
  FOR EACH ROW
  EXECUTE FUNCTION public.tutor_agent_state_touch_updated_at();

-- Lock the table down. Service role bypasses RLS, so the cloud-backend
-- still has full access; everyone else is shut out.
ALTER TABLE public.tutor_agent_state ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.tutor_agent_state FROM anon, authenticated;

-- Optional cleanup helper. Run on a cron (or periodically from the
-- backend) to prune expired rows. Doesn't delete anything by itself.
CREATE OR REPLACE FUNCTION public.tutor_agent_state_purge_expired()
RETURNS INTEGER AS $$
DECLARE
  removed INTEGER;
BEGIN
  DELETE FROM public.tutor_agent_state WHERE expires_at < NOW();
  GET DIAGNOSTICS removed = ROW_COUNT;
  RETURN removed;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

REVOKE ALL ON FUNCTION public.tutor_agent_state_purge_expired() FROM anon, authenticated;
