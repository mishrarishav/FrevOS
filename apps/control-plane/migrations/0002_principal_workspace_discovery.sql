SET LOCAL ROLE frevos_owner;

DROP POLICY IF EXISTS principal_membership_read ON frevos.workspace_memberships;
CREATE POLICY principal_membership_read ON frevos.workspace_memberships
  FOR SELECT
  TO frevos_app
  USING (user_id = current_setting('frevos.user_id', true));

DROP POLICY IF EXISTS principal_workspace_read ON frevos.workspaces;
CREATE POLICY principal_workspace_read ON frevos.workspaces
  FOR SELECT
  TO frevos_app
  USING (
    EXISTS (
      SELECT 1
      FROM frevos.workspace_memberships AS membership
      WHERE membership.workspace_id = workspaces.workspace_id
        AND membership.user_id = current_setting('frevos.user_id', true)
    )
  );

RESET ROLE;
