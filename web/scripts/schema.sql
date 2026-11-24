-- HRMS portal schema (idempotent: safe to run again)

CREATE TABLE IF NOT EXISTS employees (
  id               SERIAL PRIMARY KEY,
  email            TEXT UNIQUE NOT NULL,
  name             TEXT NOT NULL DEFAULT '',
  hrms_password_enc TEXT NOT NULL,                 -- AES-256-GCM, never sent to browser
  mode             TEXT NOT NULL DEFAULT 'off'      -- only ONE feature can be on
                   CHECK (mode IN ('off', 'day_plan', 'auto')),
  admin_disabled   BOOLEAN NOT NULL DEFAULT FALSE,  -- admin switch for this employee
  default_channel  TEXT NOT NULL DEFAULT '',
  slack_user_id    TEXT,
  slack_team_id    TEXT,
  slack_token_enc  TEXT,                            -- user token (chat:write), encrypted
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Feature 1: a one-day plan (date + optional leave time + update for Slack)
CREATE TABLE IF NOT EXISTS day_plans (
  id           SERIAL PRIMARY KEY,
  employee_id  INT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  plan_date    DATE NOT NULL,
  leave_time   TIME,                                -- NULL = 8 hours after check-in
  update_text  TEXT NOT NULL,
  channel      TEXT NOT NULL,
  status       TEXT NOT NULL DEFAULT 'pending'
               CHECK (status IN ('pending', 'done', 'failed', 'cancelled', 'missed')),
  result       TEXT,
  executed_at  TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS day_plans_pending ON day_plans (plan_date) WHERE status = 'pending';

-- What the scheduler is doing for each employee today
CREATE TABLE IF NOT EXISTS daily_runs (
  employee_id   INT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  run_date      DATE NOT NULL,
  kind          TEXT NOT NULL CHECK (kind IN ('day_plan', 'auto')),
  plan_id       INT REFERENCES day_plans(id) ON DELETE SET NULL,
  status        TEXT NOT NULL DEFAULT 'waiting'
                CHECK (status IN ('waiting', 'done', 'failed', 'skipped')),
  next_check_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  target_at     TIMESTAMPTZ,
  attempts      INT NOT NULL DEFAULT 0,
  message       TEXT,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (employee_id, run_date)
);
CREATE INDEX IF NOT EXISTS daily_runs_due ON daily_runs (next_check_at) WHERE status = 'waiting';

CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
INSERT INTO settings (key, value) VALUES ('paused', 'false') ON CONFLICT (key) DO NOTHING;

CREATE TABLE IF NOT EXISTS run_logs (
  id          BIGSERIAL PRIMARY KEY,
  employee_id INT REFERENCES employees(id) ON DELETE CASCADE,
  at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  level       TEXT NOT NULL DEFAULT 'info',
  message     TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS run_logs_emp ON run_logs (employee_id, at DESC);
