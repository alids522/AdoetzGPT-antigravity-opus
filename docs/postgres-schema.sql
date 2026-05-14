-- AdoetzGPT Postgres sync schema.
-- Replace "adoetzgpt" with your custom schema name if desired.

CREATE SCHEMA IF NOT EXISTS adoetzgpt;

CREATE TABLE IF NOT EXISTS adoetzgpt.users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  email TEXT UNIQUE,
  display_name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS adoetzgpt.app_states (
  user_id TEXT PRIMARY KEY REFERENCES adoetzgpt.users(id) ON DELETE CASCADE,
  state JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
