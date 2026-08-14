\set ON_ERROR_STOP on
BEGIN;
SET LOCAL ROLE frevos_owner;
SELECT pg_catalog.set_config('frevos.workspace_id', 'ws_local_demo', true);

INSERT INTO frevos.users (user_id, display_name, created_at) VALUES
  ('usr_local_admin', 'Local Admin', CURRENT_TIMESTAMP),
  ('usr_local_viewer', 'Local Viewer', CURRENT_TIMESTAMP)
ON CONFLICT (user_id) DO UPDATE SET display_name = EXCLUDED.display_name;

INSERT INTO frevos.external_identities
  (identity_id, user_id, issuer, subject, linked_at, last_authenticated_at) VALUES
  ('idn_local_admin', 'usr_local_admin', 'https://identity.frevos.localhost:8443/realms/frevos-local', '10000000-0000-4000-8000-000000000001', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('idn_local_viewer', 'usr_local_viewer', 'https://identity.frevos.localhost:8443/realms/frevos-local', '10000000-0000-4000-8000-000000000002', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT (issuer, subject) DO UPDATE SET last_authenticated_at = EXCLUDED.last_authenticated_at;

INSERT INTO frevos.workspaces (workspace_id, display_name, status, created_at) VALUES
  ('ws_local_demo', 'Local Demo Workspace', 'active', CURRENT_TIMESTAMP)
ON CONFLICT (workspace_id) DO UPDATE SET display_name = EXCLUDED.display_name;

INSERT INTO frevos.workspace_memberships
  (membership_id, workspace_id, user_id, status, granted_scopes, created_at) VALUES
  ('wsm_local_admin', 'ws_local_demo', 'usr_local_admin', 'active', ARRAY['workspace:read', 'client:read', 'project:read'], CURRENT_TIMESTAMP),
  ('wsm_local_viewer', 'ws_local_demo', 'usr_local_viewer', 'active', ARRAY['workspace:read', 'client:read', 'project:read'], CURRENT_TIMESTAMP)
ON CONFLICT (workspace_id, user_id) DO UPDATE SET status = EXCLUDED.status, granted_scopes = EXCLUDED.granted_scopes;

INSERT INTO frevos.clients (client_id, workspace_id, display_name, status, created_at) VALUES
  ('cli_local_acme', 'ws_local_demo', 'Acme Local', 'active', CURRENT_TIMESTAMP)
ON CONFLICT (workspace_id, client_id) DO UPDATE SET display_name = EXCLUDED.display_name;

INSERT INTO frevos.projects (project_id, workspace_id, client_id, display_name, status, created_at) VALUES
  ('prj_local_launch', 'ws_local_demo', 'cli_local_acme', 'Local Launch', 'active', CURRENT_TIMESTAMP)
ON CONFLICT (workspace_id, project_id) DO UPDATE SET display_name = EXCLUDED.display_name;

COMMIT;
