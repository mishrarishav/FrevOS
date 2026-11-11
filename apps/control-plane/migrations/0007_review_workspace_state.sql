SET LOCAL ROLE frevos_owner;

CREATE TABLE frevos.review_workspace_state (
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

ALTER TABLE frevos.review_workspace_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE frevos.review_workspace_state FORCE ROW LEVEL SECURITY;
CREATE POLICY workspace_boundary ON frevos.review_workspace_state
  USING (workspace_id = current_setting('frevos.workspace_id', true))
  WITH CHECK (workspace_id = current_setting('frevos.workspace_id', true));

REVOKE ALL ON frevos.review_workspace_state FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE ON frevos.review_workspace_state TO frevos_app;

CREATE TABLE frevos.review_migration_receipts (
  workspace_id text NOT NULL REFERENCES frevos.workspaces (workspace_id) ON DELETE RESTRICT,
  migration_id text NOT NULL CHECK (migration_id ~ '^rmi_[a-f0-9]{32}$'),
  source_sha256 text NOT NULL CHECK (source_sha256 ~ '^[a-f0-9]{64}$'),
  mapping_sha256 text NOT NULL CHECK (mapping_sha256 ~ '^[a-f0-9]{64}$'),
  imported_sha256 text NOT NULL CHECK (imported_sha256 ~ '^[a-f0-9]{64}$'),
  requested_by text NOT NULL REFERENCES frevos.users (user_id) ON DELETE RESTRICT,
  imported_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (workspace_id, migration_id),
  UNIQUE (workspace_id, source_sha256, mapping_sha256)
);

ALTER TABLE frevos.review_migration_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE frevos.review_migration_receipts FORCE ROW LEVEL SECURITY;
CREATE POLICY workspace_boundary ON frevos.review_migration_receipts
  USING (workspace_id = current_setting('frevos.workspace_id', true))
  WITH CHECK (workspace_id = current_setting('frevos.workspace_id', true));
REVOKE ALL ON frevos.review_migration_receipts FROM PUBLIC;
GRANT SELECT, INSERT ON frevos.review_migration_receipts TO frevos_app;

RESET ROLE;
