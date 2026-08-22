SET LOCAL ROLE frevos_owner;

CREATE TABLE IF NOT EXISTS frevos.project_automation_profiles (
  workspace_id text NOT NULL,
  project_id text NOT NULL,
  provider text NOT NULL CHECK (provider = 'github'),
  provider_repository_id text NOT NULL CHECK (provider_repository_id ~ '^\d{1,20}$'),
  repository_owner text NOT NULL CHECK (repository_owner ~ '^[A-Za-z0-9][A-Za-z0-9-]{0,38}$'),
  repository_name text NOT NULL CHECK (repository_name ~ '^[A-Za-z0-9._-]{1,100}$'),
  repository_url text NOT NULL CHECK (repository_url ~ '^https://github\.com/'),
  default_branch text NOT NULL CHECK (default_branch ~ '^[A-Za-z0-9][A-Za-z0-9._/-]{0,119}$'),
  agent_id text NOT NULL CHECK (agent_id ~ '^svc_[A-Za-z0-9][A-Za-z0-9_-]{0,119}$'),
  environment text NOT NULL CHECK (environment = 'uat'),
  public_origin text NOT NULL CHECK (public_origin = 'https://tserver2.eeslindia.org'),
  api_base_path text NOT NULL CHECK (api_base_path = '/apiTrackGrn'),
  health_path text NOT NULL CHECK (health_path = '/apiTrackGrn/health/live'),
  swagger_path text NOT NULL CHECK (swagger_path = '/apiTrackGrn/swagger'),
  allowed_actions text[] NOT NULL CHECK (
    allowed_actions <@ ARRAY[
      'repository.inspect',
      'repository.propose-commit',
      'repository.commit-push',
      'project.build',
      'uat.deploy'
    ]::text[]
    AND cardinality(allowed_actions) BETWEEN 1 AND 5
  ),
  created_at timestamptz NOT NULL,
  PRIMARY KEY (workspace_id, project_id),
  UNIQUE (provider, provider_repository_id),
  FOREIGN KEY (workspace_id, project_id)
    REFERENCES frevos.projects (workspace_id, project_id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS frevos.project_automation_operations (
  operation_id text PRIMARY KEY CHECK (operation_id ~ '^op_[A-Za-z0-9][A-Za-z0-9_-]{0,119}$'),
  workspace_id text NOT NULL,
  project_id text NOT NULL,
  agent_id text NOT NULL CHECK (agent_id ~ '^svc_[A-Za-z0-9][A-Za-z0-9_-]{0,119}$'),
  requested_by text NOT NULL REFERENCES frevos.users (user_id) ON DELETE RESTRICT,
  action text NOT NULL CHECK (action IN (
    'repository.inspect',
    'repository.propose-commit',
    'repository.commit-push',
    'project.build',
    'uat.deploy'
  )),
  status text NOT NULL CHECK (status IN ('queued', 'claimed', 'succeeded', 'failed')),
  input jsonb NOT NULL CHECK (jsonb_typeof(input) = 'object' AND pg_column_size(input) <= 16384),
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
  ),
  FOREIGN KEY (workspace_id, project_id)
    REFERENCES frevos.project_automation_profiles (workspace_id, project_id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS project_automation_operations_claim_idx
  ON frevos.project_automation_operations (agent_id, status, created_at, operation_id);

ALTER TABLE frevos.project_automation_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE frevos.project_automation_profiles FORCE ROW LEVEL SECURITY;
ALTER TABLE frevos.project_automation_operations ENABLE ROW LEVEL SECURITY;
ALTER TABLE frevos.project_automation_operations FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS workspace_boundary ON frevos.project_automation_profiles;
CREATE POLICY workspace_boundary ON frevos.project_automation_profiles
  USING (workspace_id = current_setting('frevos.workspace_id', true))
  WITH CHECK (workspace_id = current_setting('frevos.workspace_id', true));

DROP POLICY IF EXISTS workspace_boundary ON frevos.project_automation_operations;
CREATE POLICY workspace_boundary ON frevos.project_automation_operations
  USING (workspace_id = current_setting('frevos.workspace_id', true))
  WITH CHECK (workspace_id = current_setting('frevos.workspace_id', true));

RESET ROLE;

REVOKE ALL ON frevos.project_automation_profiles, frevos.project_automation_operations FROM PUBLIC;
GRANT SELECT ON frevos.project_automation_profiles TO frevos_app;
GRANT SELECT, INSERT, UPDATE ON frevos.project_automation_operations TO frevos_app;
