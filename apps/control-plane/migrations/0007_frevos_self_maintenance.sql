SET LOCAL ROLE frevos_owner;

ALTER TABLE frevos.project_automation_profiles
  DROP CONSTRAINT IF EXISTS project_automation_profiles_api_base_path_check;
ALTER TABLE frevos.project_automation_profiles
  ADD CONSTRAINT project_automation_profiles_api_base_path_check CHECK (
    api_base_path IN ('/apiTrackGrn', '/frevos')
  );

ALTER TABLE frevos.project_automation_profiles
  DROP CONSTRAINT IF EXISTS project_automation_profiles_health_path_check;
ALTER TABLE frevos.project_automation_profiles
  ADD CONSTRAINT project_automation_profiles_health_path_check CHECK (
    health_path IN ('/apiTrackGrn/health/live', '/frevos/health')
  );

ALTER TABLE frevos.project_automation_profiles
  DROP CONSTRAINT IF EXISTS project_automation_profiles_swagger_path_check;
ALTER TABLE frevos.project_automation_profiles
  ADD CONSTRAINT project_automation_profiles_swagger_path_check CHECK (
    swagger_path IN ('/apiTrackGrn/swagger', '/frevos/')
  );

ALTER TABLE frevos.project_automation_profiles
  DROP CONSTRAINT IF EXISTS project_automation_profiles_allowed_actions_check;
ALTER TABLE frevos.project_automation_profiles
  ADD CONSTRAINT project_automation_profiles_allowed_actions_check CHECK (
    allowed_actions <@ ARRAY[
      'repository.inspect',
      'repository.propose-commit',
      'repository.commit-push',
      'repository.open-pull-request',
      'repository.squash-merge',
      'repository.enable-auto-merge',
      'project.build',
      'uat.deploy',
      'uat.release'
    ]::text[]
    AND cardinality(allowed_actions) BETWEEN 1 AND 9
  );

ALTER TABLE frevos.project_automation_operations
  DROP CONSTRAINT IF EXISTS project_automation_operations_action_check;
ALTER TABLE frevos.project_automation_operations
  ADD CONSTRAINT project_automation_operations_action_check CHECK (action IN (
    'repository.inspect',
    'repository.propose-commit',
    'repository.commit-push',
    'repository.open-pull-request',
    'repository.squash-merge',
    'repository.enable-auto-merge',
    'project.build',
    'uat.deploy',
    'uat.release'
  ));

RESET ROLE;
