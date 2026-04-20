-- SketchBot Classroom Session Schema
-- Run this in the Supabase SQL editor to set up classroom session support.
-- Safe to re-run (uses IF NOT EXISTS / CREATE OR REPLACE).

-- ─── Tables ───────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS classroom_sessions (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  join_code       TEXT        UNIQUE NOT NULL,
  teacher_id      UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  classroom_name  TEXT        NOT NULL DEFAULT 'My Class',
  lesson_plan_id  TEXT,
  status          TEXT        NOT NULL DEFAULT 'live'
                              CHECK (status IN ('live', 'closed')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  closed_at       TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS session_participants (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id          UUID        NOT NULL REFERENCES classroom_sessions(id) ON DELETE CASCADE,
  student_name        TEXT        NOT NULL,
  joined_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_heartbeat_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  current_step        INTEGER     DEFAULT 0,
  xp_earned           INTEGER     DEFAULT 0,
  status              TEXT        NOT NULL DEFAULT 'active'
                                  CHECK (status IN ('active', 'disconnected', 'left'))
);

CREATE TABLE IF NOT EXISTS student_progress (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id          UUID        REFERENCES classroom_sessions(id) ON DELETE SET NULL,
  student_name        TEXT        NOT NULL,
  concept_id          TEXT,
  steps_completed     INTEGER     DEFAULT 0,
  xp_earned           INTEGER     DEFAULT 0,
  drawings_count      INTEGER     DEFAULT 0,
  recorded_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── Indexes ──────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_classroom_sessions_join_code ON classroom_sessions(join_code);
CREATE INDEX IF NOT EXISTS idx_classroom_sessions_teacher   ON classroom_sessions(teacher_id);
CREATE INDEX IF NOT EXISTS idx_session_participants_session  ON session_participants(session_id);
CREATE INDEX IF NOT EXISTS idx_student_progress_session      ON student_progress(session_id);
CREATE INDEX IF NOT EXISTS idx_student_progress_student      ON student_progress(student_name);

-- ─── Row-Level Security ───────────────────────────────────────────────────────

ALTER TABLE classroom_sessions     ENABLE ROW LEVEL SECURITY;
ALTER TABLE session_participants   ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_progress       ENABLE ROW LEVEL SECURITY;

-- Service role bypasses RLS — local-runtime uses service key, so all backend writes work.
-- The anon key (frontend) only needs to read live sessions by join_code.

CREATE POLICY IF NOT EXISTS "Service role full access on classroom_sessions"
  ON classroom_sessions FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY IF NOT EXISTS "Service role full access on session_participants"
  ON session_participants FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY IF NOT EXISTS "Service role full access on student_progress"
  ON student_progress FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Authenticated teachers can see their own sessions
CREATE POLICY IF NOT EXISTS "Teachers see own sessions"
  ON classroom_sessions FOR SELECT TO authenticated
  USING (teacher_id = auth.uid());

-- Anyone with the join code can read that session (validated server-side)
CREATE POLICY IF NOT EXISTS "Read live session by join code"
  ON classroom_sessions FOR SELECT TO anon
  USING (status = 'live');
