SET LOCAL ROLE frevos_owner;

CREATE TABLE IF NOT EXISTS frevos.local_credentials (
  identity_id text PRIMARY KEY,
  user_id text NOT NULL,
  username text NOT NULL CHECK (
    username ~ '^[a-z0-9][a-z0-9._-]{2,63}$'
    AND username = lower(username)
  ),
  password_salt bytea NOT NULL CHECK (octet_length(password_salt) = 16),
  password_hash bytea NOT NULL CHECK (octet_length(password_hash) = 64),
  status text NOT NULL CHECK (status IN ('active', 'disabled')),
  failed_attempts integer NOT NULL DEFAULT 0 CHECK (failed_attempts BETWEEN 0 AND 5),
  locked_until timestamptz,
  created_at timestamptz NOT NULL,
  password_changed_at timestamptz NOT NULL,
  last_authenticated_at timestamptz,
  UNIQUE (username),
  FOREIGN KEY (user_id, identity_id)
    REFERENCES frevos.external_identities (user_id, identity_id)
    ON DELETE RESTRICT
);

RESET ROLE;

REVOKE ALL ON frevos.local_credentials FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE ON frevos.local_credentials TO frevos_app;
