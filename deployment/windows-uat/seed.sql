\set ON_ERROR_STOP on
BEGIN;
SET LOCAL ROLE frevos_owner;
SELECT pg_catalog.set_config('frevos.workspace_id', 'ws_uat_demo', true);

INSERT INTO frevos.workspaces (workspace_id, display_name, status, created_at) VALUES
  ('ws_uat_demo', 'Personal Workspace', 'active', CURRENT_TIMESTAMP)
ON CONFLICT (workspace_id) DO UPDATE SET display_name = EXCLUDED.display_name;

INSERT INTO frevos.workspace_memberships
  (membership_id, workspace_id, user_id, status, granted_scopes, created_at) VALUES
  (
    'wsm_windows_admin',
    'ws_uat_demo',
    'usr_windows_admin',
    'active',
    ARRAY['workspace:read', 'client:read', 'client:write', 'project:read', 'project:write'],
    CURRENT_TIMESTAMP
  )
ON CONFLICT (workspace_id, user_id) DO UPDATE
  SET status = EXCLUDED.status, granted_scopes = EXCLUDED.granted_scopes;

INSERT INTO frevos.clients (client_id, workspace_id, display_name, status, created_at) VALUES
  ('cli_uat_personal', 'ws_uat_demo', 'Personal', 'active', CURRENT_TIMESTAMP)
ON CONFLICT (workspace_id, client_id) DO UPDATE SET display_name = EXCLUDED.display_name;

INSERT INTO frevos.projects (project_id, workspace_id, client_id, display_name, status, created_at) VALUES
  ('prj_uat_frevos', 'ws_uat_demo', 'cli_uat_personal', 'FrevOS', 'active', CURRENT_TIMESTAMP),
  ('prj_uat_trackgrn', 'ws_uat_demo', 'cli_uat_personal', 'TrackGRN', 'active', CURRENT_TIMESTAMP)
ON CONFLICT (workspace_id, project_id) DO UPDATE SET display_name = EXCLUDED.display_name;

INSERT INTO frevos.project_automation_profiles (
  workspace_id,
  project_id,
  provider,
  provider_repository_id,
  repository_owner,
  repository_name,
  repository_url,
  default_branch,
  agent_id,
  environment,
  public_origin,
  api_base_path,
  health_path,
  swagger_path,
  allowed_actions,
  created_at
) VALUES (
  'ws_uat_demo',
  'prj_uat_trackgrn',
  'github',
  '1334902237',
  'mishrarishav',
  'TraceGRN',
  'https://github.com/mishrarishav/TraceGRN',
  'main',
  'svc_trackgrn_windows_agent',
  'uat',
  'https://tserver2.eeslindia.org',
  '/apiTrackGrn',
  '/apiTrackGrn/health/live',
  '/apiTrackGrn/swagger',
  ARRAY[
    'repository.inspect',
    'repository.propose-commit',
    'repository.commit-push',
    'repository.open-pull-request',
    'repository.squash-merge',
    'project.build',
    'uat.deploy'
  ],
  CURRENT_TIMESTAMP
), (
  'ws_uat_demo',
  'prj_uat_frevos',
  'github',
  '1329122983',
  'mishrarishav',
  'FrevOS',
  'https://github.com/mishrarishav/FrevOS',
  'main',
  'svc_frevos_windows_agent',
  'uat',
  'https://tserver2.eeslindia.org',
  '/frevos',
  '/frevos/health',
  '/frevos/',
  ARRAY[
    'repository.inspect',
    'repository.propose-commit',
    'repository.commit-push',
    'repository.open-pull-request',
    'repository.enable-auto-merge',
    'project.build',
    'uat.release'
  ],
  CURRENT_TIMESTAMP
)
ON CONFLICT (workspace_id, project_id) DO UPDATE SET
  agent_id = EXCLUDED.agent_id,
  provider_repository_id = EXCLUDED.provider_repository_id,
  repository_url = EXCLUDED.repository_url,
  default_branch = EXCLUDED.default_branch,
  allowed_actions = EXCLUDED.allowed_actions;

COMMIT;
