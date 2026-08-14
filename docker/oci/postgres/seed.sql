\set ON_ERROR_STOP on
BEGIN;
SET LOCAL ROLE frevos_owner;
SELECT pg_catalog.set_config('frevos.workspace_id', 'ws_uat_demo', true);

INSERT INTO frevos.users (user_id, display_name, created_at) VALUES
  ('usr_uat_admin', 'UAT Admin', CURRENT_TIMESTAMP),
  ('usr_uat_viewer', 'UAT Viewer', CURRENT_TIMESTAMP)
ON CONFLICT (user_id) DO UPDATE SET display_name = EXCLUDED.display_name;

INSERT INTO frevos.external_identities
  (identity_id, user_id, issuer, subject, linked_at, last_authenticated_at) VALUES
  ('idn_uat_admin', 'usr_uat_admin', :'issuer', :'admin_subject', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('idn_uat_viewer', 'usr_uat_viewer', :'issuer', :'viewer_subject', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT (issuer, subject) DO UPDATE SET last_authenticated_at = EXCLUDED.last_authenticated_at;

INSERT INTO frevos.workspaces (workspace_id, display_name, status, created_at) VALUES
  ('ws_uat_demo', 'UAT Demo Workspace', 'active', CURRENT_TIMESTAMP)
ON CONFLICT (workspace_id) DO UPDATE SET display_name = EXCLUDED.display_name;

INSERT INTO frevos.workspace_memberships
  (membership_id, workspace_id, user_id, status, granted_scopes, created_at) VALUES
  ('wsm_uat_admin', 'ws_uat_demo', 'usr_uat_admin', 'active', ARRAY['workspace:read', 'client:read', 'project:read'], CURRENT_TIMESTAMP),
  ('wsm_uat_viewer', 'ws_uat_demo', 'usr_uat_viewer', 'active', ARRAY['workspace:read', 'client:read', 'project:read'], CURRENT_TIMESTAMP)
ON CONFLICT (workspace_id, user_id) DO UPDATE SET status = EXCLUDED.status, granted_scopes = EXCLUDED.granted_scopes;

INSERT INTO frevos.clients (client_id, workspace_id, display_name, status, created_at) VALUES
  ('cli_uat_acme', 'ws_uat_demo', 'Acme UAT', 'active', CURRENT_TIMESTAMP)
ON CONFLICT (workspace_id, client_id) DO UPDATE SET display_name = EXCLUDED.display_name;

INSERT INTO frevos.projects (project_id, workspace_id, client_id, display_name, status, created_at) VALUES
  ('prj_uat_launch', 'ws_uat_demo', 'cli_uat_acme', 'UAT Launch', 'active', CURRENT_TIMESTAMP)
ON CONFLICT (workspace_id, project_id) DO UPDATE SET display_name = EXCLUDED.display_name;

COMMIT;
