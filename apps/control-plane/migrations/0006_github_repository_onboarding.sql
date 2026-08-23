SET LOCAL ROLE frevos_owner;

CREATE TABLE IF NOT EXISTS frevos.github_connections (
  connection_id text PRIMARY KEY CHECK (connection_id ~ '^ghc_[A-Za-z0-9][A-Za-z0-9_-]{0,119}$'),
  workspace_id text NOT NULL REFERENCES frevos.workspaces (workspace_id) ON DELETE RESTRICT,
  provider text NOT NULL CHECK (provider = 'github'),
  provider_account_id text NOT NULL CHECK (provider_account_id ~ '^\d{1,20}$'),
  account_login text NOT NULL CHECK (account_login ~ '^[A-Za-z0-9][A-Za-z0-9-]{0,38}$'),
  agent_id text NOT NULL CHECK (agent_id ~ '^svc_[A-Za-z0-9][A-Za-z0-9_-]{0,119}$'),
  status text NOT NULL CHECK (status = 'active'),
  repositories jsonb NOT NULL CHECK (
    jsonb_typeof(repositories) = 'array'
    AND jsonb_array_length(repositories) <= 50
    AND pg_column_size(repositories) <= 65536
  ),
  verified_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL,
  UNIQUE (workspace_id, connection_id),
  UNIQUE (workspace_id, provider, provider_account_id)
);

CREATE TABLE IF NOT EXISTS frevos.github_discovery_operations (
  operation_id text PRIMARY KEY CHECK (operation_id ~ '^op_[A-Za-z0-9][A-Za-z0-9_-]{0,119}$'),
  workspace_id text NOT NULL REFERENCES frevos.workspaces (workspace_id) ON DELETE RESTRICT,
  agent_id text NOT NULL CHECK (agent_id ~ '^svc_[A-Za-z0-9][A-Za-z0-9_-]{0,119}$'),
  requested_by text NOT NULL REFERENCES frevos.users (user_id) ON DELETE RESTRICT,
  action text NOT NULL CHECK (action = 'github.account.discover'),
  status text NOT NULL CHECK (status IN ('queued', 'claimed', 'succeeded', 'failed')),
  result jsonb CHECK (result IS NULL OR (jsonb_typeof(result) = 'object' AND pg_column_size(result) <= 65536)),
  error_code text CHECK (error_code IS NULL OR error_code ~ '^[a-z][a-z0-9-]{0,62}$'),
  created_at timestamptz NOT NULL,
  claimed_at timestamptz,
  completed_at timestamptz,
  CHECK (
    (status = 'queued' AND claimed_at IS NULL AND completed_at IS NULL AND result IS NULL AND error_code IS NULL)
    OR (status = 'claimed' AND claimed_at IS NOT NULL AND completed_at IS NULL AND result IS NULL AND error_code IS NULL)
    OR (status = 'succeeded' AND claimed_at IS NOT NULL AND completed_at IS NOT NULL AND result IS NOT NULL AND error_code IS NULL)
    OR (status = 'failed' AND claimed_at IS NOT NULL AND completed_at IS NOT NULL AND result IS NOT NULL AND error_code IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS github_discovery_operations_claim_idx
  ON frevos.github_discovery_operations (workspace_id, agent_id, status, created_at, operation_id);

CREATE TABLE IF NOT EXISTS frevos.project_repository_connections (
  workspace_id text NOT NULL,
  project_id text NOT NULL,
  connection_id text NOT NULL,
  provider text NOT NULL CHECK (provider = 'github'),
  provider_repository_id text NOT NULL CHECK (provider_repository_id ~ '^\d{1,20}$'),
  repository jsonb NOT NULL CHECK (jsonb_typeof(repository) = 'object' AND pg_column_size(repository) <= 8192),
  status text NOT NULL CHECK (status = 'connected'),
  created_at timestamptz NOT NULL,
  PRIMARY KEY (workspace_id, project_id),
  UNIQUE (workspace_id, provider, provider_repository_id),
  FOREIGN KEY (workspace_id, project_id)
    REFERENCES frevos.projects (workspace_id, project_id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id, connection_id)
    REFERENCES frevos.github_connections (workspace_id, connection_id) ON DELETE RESTRICT
);

ALTER TABLE frevos.github_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE frevos.github_connections FORCE ROW LEVEL SECURITY;
ALTER TABLE frevos.github_discovery_operations ENABLE ROW LEVEL SECURITY;
ALTER TABLE frevos.github_discovery_operations FORCE ROW LEVEL SECURITY;
ALTER TABLE frevos.project_repository_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE frevos.project_repository_connections FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS workspace_boundary ON frevos.github_connections;
CREATE POLICY workspace_boundary ON frevos.github_connections
  USING (workspace_id = current_setting('frevos.workspace_id', true))
  WITH CHECK (workspace_id = current_setting('frevos.workspace_id', true));

DROP POLICY IF EXISTS workspace_boundary ON frevos.github_discovery_operations;
CREATE POLICY workspace_boundary ON frevos.github_discovery_operations
  USING (workspace_id = current_setting('frevos.workspace_id', true))
  WITH CHECK (workspace_id = current_setting('frevos.workspace_id', true));

DROP POLICY IF EXISTS workspace_boundary ON frevos.project_repository_connections;
CREATE POLICY workspace_boundary ON frevos.project_repository_connections
  USING (workspace_id = current_setting('frevos.workspace_id', true))
  WITH CHECK (workspace_id = current_setting('frevos.workspace_id', true));

RESET ROLE;

REVOKE ALL ON
  frevos.github_connections,
  frevos.github_discovery_operations,
  frevos.project_repository_connections
FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE ON
  frevos.github_connections,
  frevos.github_discovery_operations
TO frevos_app;
GRANT SELECT, INSERT ON frevos.project_repository_connections TO frevos_app;
