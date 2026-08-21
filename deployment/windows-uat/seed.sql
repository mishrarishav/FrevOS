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
  ('prj_uat_frevos', 'ws_uat_demo', 'cli_uat_personal', 'FrevOS', 'active', CURRENT_TIMESTAMP)
ON CONFLICT (workspace_id, project_id) DO UPDATE SET display_name = EXCLUDED.display_name;

COMMIT;
