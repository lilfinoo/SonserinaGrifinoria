CREATE TABLE IF NOT EXISTS users (
  name text PRIMARY KEY,
  salt text NOT NULL,
  hash text NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS users_name_case_insensitive ON users (lower(name));

CREATE TABLE IF NOT EXISTS sessions (
  token text PRIMARY KEY,
  "user" text NOT NULL REFERENCES users(name) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS results (
  "user" text NOT NULL REFERENCES users(name) ON DELETE CASCADE,
  day date NOT NULL,
  points integer NOT NULL CHECK (points >= 0),
  PRIMARY KEY ("user", day)
);

CREATE TABLE IF NOT EXISTS rooms (
  code text PRIMARY KEY,
  data jsonb NOT NULL
);
