SET LOCAL ROLE frevos_owner;

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
      'project.build',
      'uat.deploy'
    ]::text[]
    AND cardinality(allowed_actions) BETWEEN 1 AND 7
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
    'project.build',
    'uat.deploy'
  ));

UPDATE frevos.project_automation_profiles
SET allowed_actions = ARRAY[
  'repository.inspect',
  'repository.propose-commit',
  'repository.commit-push',
  'repository.open-pull-request',
  'repository.squash-merge',
  'project.build',
  'uat.deploy'
]::text[]
WHERE workspace_id = 'ws_uat_demo'
  AND project_id = 'prj_uat_trackgrn'
  AND provider = 'github'
  AND provider_repository_id = '1334902237';

RESET ROLE;
