SET LOCAL ROLE frevos_owner;

CREATE TABLE frevos.server_monitoring_state (
  workspace_id text PRIMARY KEY REFERENCES frevos.workspaces (workspace_id) ON DELETE RESTRICT,
  revision bigint NOT NULL DEFAULT 1 CHECK (revision >= 1),
  document jsonb NOT NULL CHECK (
    jsonb_typeof(document) = 'object'
    AND COALESCE(document -> 'version' = '1'::jsonb, false)
    AND COALESCE(document ->> 'workspaceId' = workspace_id, false)
    AND octet_length(document::text) <= 33554432
  ),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

ALTER TABLE frevos.server_monitoring_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE frevos.server_monitoring_state FORCE ROW LEVEL SECURITY;
CREATE POLICY workspace_boundary ON frevos.server_monitoring_state
  USING (workspace_id = current_setting('frevos.workspace_id', true))
  WITH CHECK (workspace_id = current_setting('frevos.workspace_id', true));
REVOKE ALL ON frevos.server_monitoring_state FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE ON frevos.server_monitoring_state TO frevos_app;

RESET ROLE;
