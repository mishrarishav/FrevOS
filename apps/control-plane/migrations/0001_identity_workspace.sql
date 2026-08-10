DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'frevos_owner') THEN
    CREATE ROLE frevos_owner NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS;
  END IF;

  IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'frevos_app') THEN
    CREATE ROLE frevos_app NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS;
  END IF;

  IF EXISTS (
    SELECT FROM pg_catalog.pg_roles
    WHERE rolname = 'frevos_owner'
      AND (rolcanlogin OR rolinherit OR rolsuper OR rolcreatedb OR rolcreaterole OR rolreplication OR rolbypassrls)
  ) THEN
    RAISE EXCEPTION 'Existing frevos_owner role has unsafe attributes';
  END IF;

  IF EXISTS (
    SELECT FROM pg_catalog.pg_roles
    WHERE rolname = 'frevos_app'
      AND (rolcanlogin OR rolinherit OR rolsuper OR rolcreatedb OR rolcreaterole OR rolreplication OR rolbypassrls)
  ) THEN
    RAISE EXCEPTION 'Existing frevos_app role has unsafe attributes';
  END IF;
END
$$;

GRANT frevos_owner TO CURRENT_USER;
GRANT frevos_app TO CURRENT_USER;

CREATE SCHEMA IF NOT EXISTS frevos AUTHORIZATION frevos_owner;
ALTER SCHEMA frevos OWNER TO frevos_owner;

SET LOCAL ROLE frevos_owner;

CREATE TABLE IF NOT EXISTS frevos.users (
  user_id text PRIMARY KEY CHECK (user_id ~ '^usr_[A-Za-z0-9][A-Za-z0-9_-]{0,119}$'),
  display_name text CHECK (display_name IS NULL OR (char_length(display_name) BETWEEN 1 AND 120 AND display_name = btrim(display_name))),
  created_at timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS frevos.external_identities (
  identity_id text PRIMARY KEY CHECK (identity_id ~ '^idn_[A-Za-z0-9][A-Za-z0-9_-]{0,119}$'),
  user_id text NOT NULL REFERENCES frevos.users (user_id) ON DELETE RESTRICT,
  issuer text NOT NULL CHECK (issuer ~ '^https://'),
  subject text NOT NULL CHECK (char_length(subject) BETWEEN 1 AND 255),
  linked_at timestamptz NOT NULL,
  last_authenticated_at timestamptz NOT NULL,
  UNIQUE (issuer, subject),
  UNIQUE (user_id, identity_id),
  CHECK (last_authenticated_at >= linked_at)
);

CREATE TABLE IF NOT EXISTS frevos.sessions (
  session_id text PRIMARY KEY CHECK (session_id ~ '^ses_[A-Za-z0-9][A-Za-z0-9_-]{0,119}$'),
  user_id text NOT NULL,
  identity_id text NOT NULL,
  token_hash bytea NOT NULL UNIQUE CHECK (octet_length(token_hash) = 32),
  csrf_hash bytea NOT NULL CHECK (octet_length(csrf_hash) = 32),
  status text NOT NULL CHECK (status IN ('active', 'revoked')),
  authenticated_at timestamptz NOT NULL,
  last_seen_at timestamptz NOT NULL,
  idle_expires_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  CHECK (last_seen_at >= authenticated_at),
  CHECK (idle_expires_at > authenticated_at),
  CHECK (idle_expires_at <= expires_at),
  CHECK (expires_at > authenticated_at),
  CHECK ((status = 'active' AND revoked_at IS NULL) OR (status = 'revoked' AND revoked_at IS NOT NULL)),
  FOREIGN KEY (user_id, identity_id) REFERENCES frevos.external_identities (user_id, identity_id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS frevos.workspaces (
  workspace_id text PRIMARY KEY CHECK (workspace_id ~ '^ws_[A-Za-z0-9][A-Za-z0-9_-]{0,119}$'),
  display_name text NOT NULL CHECK (char_length(display_name) BETWEEN 1 AND 120 AND display_name = btrim(display_name)),
  status text NOT NULL CHECK (status IN ('active', 'suspended')),
  created_at timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS frevos.workspace_memberships (
  membership_id text PRIMARY KEY CHECK (membership_id ~ '^wsm_[A-Za-z0-9][A-Za-z0-9_-]{0,119}$'),
  workspace_id text NOT NULL REFERENCES frevos.workspaces (workspace_id) ON DELETE RESTRICT,
  user_id text NOT NULL REFERENCES frevos.users (user_id) ON DELETE RESTRICT,
  status text NOT NULL CHECK (status IN ('active', 'suspended', 'revoked')),
  granted_scopes text[] NOT NULL CHECK (cardinality(granted_scopes) BETWEEN 1 AND 128),
  created_at timestamptz NOT NULL,
  UNIQUE (workspace_id, user_id),
  UNIQUE (workspace_id, membership_id)
);

CREATE TABLE IF NOT EXISTS frevos.clients (
  client_id text NOT NULL CHECK (client_id ~ '^cli_[A-Za-z0-9][A-Za-z0-9_-]{0,119}$'),
  workspace_id text NOT NULL REFERENCES frevos.workspaces (workspace_id) ON DELETE RESTRICT,
  display_name text NOT NULL CHECK (char_length(display_name) BETWEEN 1 AND 120 AND display_name = btrim(display_name)),
  status text NOT NULL CHECK (status IN ('active', 'archived')),
  created_at timestamptz NOT NULL,
  PRIMARY KEY (workspace_id, client_id)
);

CREATE TABLE IF NOT EXISTS frevos.projects (
  project_id text NOT NULL CHECK (project_id ~ '^prj_[A-Za-z0-9][A-Za-z0-9_-]{0,119}$'),
  workspace_id text NOT NULL REFERENCES frevos.workspaces (workspace_id) ON DELETE RESTRICT,
  client_id text,
  display_name text NOT NULL CHECK (char_length(display_name) BETWEEN 1 AND 120 AND display_name = btrim(display_name)),
  status text NOT NULL CHECK (status IN ('active', 'archived')),
  created_at timestamptz NOT NULL,
  PRIMARY KEY (workspace_id, project_id),
  FOREIGN KEY (workspace_id, client_id) REFERENCES frevos.clients (workspace_id, client_id) ON DELETE RESTRICT
);

ALTER TABLE frevos.workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE frevos.workspaces FORCE ROW LEVEL SECURITY;
ALTER TABLE frevos.workspace_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE frevos.workspace_memberships FORCE ROW LEVEL SECURITY;
ALTER TABLE frevos.clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE frevos.clients FORCE ROW LEVEL SECURITY;
ALTER TABLE frevos.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE frevos.projects FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS workspace_boundary ON frevos.workspaces;
CREATE POLICY workspace_boundary ON frevos.workspaces
  USING (workspace_id = current_setting('frevos.workspace_id', true))
  WITH CHECK (workspace_id = current_setting('frevos.workspace_id', true));

DROP POLICY IF EXISTS workspace_boundary ON frevos.workspace_memberships;
CREATE POLICY workspace_boundary ON frevos.workspace_memberships
  USING (workspace_id = current_setting('frevos.workspace_id', true))
  WITH CHECK (workspace_id = current_setting('frevos.workspace_id', true));

DROP POLICY IF EXISTS workspace_boundary ON frevos.clients;
CREATE POLICY workspace_boundary ON frevos.clients
  USING (workspace_id = current_setting('frevos.workspace_id', true))
  WITH CHECK (workspace_id = current_setting('frevos.workspace_id', true));

DROP POLICY IF EXISTS workspace_boundary ON frevos.projects;
CREATE POLICY workspace_boundary ON frevos.projects
  USING (workspace_id = current_setting('frevos.workspace_id', true))
  WITH CHECK (workspace_id = current_setting('frevos.workspace_id', true));

CREATE OR REPLACE FUNCTION frevos.resolve_workspace_evidence(
  requested_user_id text,
  requested_workspace_id text
)
RETURNS TABLE (
  workspace_id text,
  workspace_display_name text,
  workspace_status text,
  workspace_created_at timestamptz,
  membership_id text,
  membership_user_id text,
  membership_status text,
  membership_granted_scopes text[],
  membership_created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, frevos
AS $function$
BEGIN
  PERFORM pg_catalog.set_config('frevos.workspace_id', requested_workspace_id, true);

  RETURN QUERY
  SELECT
    workspace.workspace_id,
    workspace.display_name,
    workspace.status,
    workspace.created_at,
    membership.membership_id,
    membership.user_id,
    membership.status,
    membership.granted_scopes,
    membership.created_at
  FROM frevos.workspaces AS workspace
  INNER JOIN frevos.workspace_memberships AS membership
    ON membership.workspace_id = workspace.workspace_id
  WHERE workspace.workspace_id = requested_workspace_id
    AND membership.user_id = requested_user_id;
END
$function$;

RESET ROLE;

REVOKE ALL ON SCHEMA frevos FROM PUBLIC;
REVOKE ALL ON ALL TABLES IN SCHEMA frevos FROM PUBLIC;
GRANT USAGE ON SCHEMA frevos TO frevos_app;
GRANT SELECT, INSERT, UPDATE ON frevos.users, frevos.external_identities, frevos.sessions TO frevos_app;
GRANT SELECT, INSERT, UPDATE ON frevos.workspaces, frevos.workspace_memberships, frevos.clients, frevos.projects TO frevos_app;
REVOKE ALL ON FUNCTION frevos.resolve_workspace_evidence(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION frevos.resolve_workspace_evidence(text, text) TO frevos_app;
