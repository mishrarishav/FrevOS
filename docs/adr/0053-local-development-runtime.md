# ADR 0053: Project-scoped local development sessions

Status: Accepted for the owner-requested development pilot, 2026-10-23.

The owner requests frontend/backend development servers, database-profile
selection, preview and Start/Stop/Restart/Kill controls inside DevSetu using the
existing System connector. The HRMS desktop launcher is a reference only; do not
modify it or require it to run. This bounded task is stacked on the verified
configured-component pilot at `915173a272d67e08c59caf34ce2fd34785f616ce`.
Preserve its final working-tree handoff updates. Phase 4 exit remains open.

Reuse authenticated connector ownership, workspace/CSRF enforcement and durable
business actions. A browser selects discovered project-relative services,
registered npm development scripts or the dotnet development recipe, loopback
ports and local environment-file references. It cannot submit shell commands,
secret values, arbitrary executable paths or arbitrary PIDs. Configuration is
revisioned; commands bind the actor, device, repository, revision and fresh
observation. Record intent before execution; retries never blindly repeat an
uncertain process start.

Launch each service in a private Windows job before starting its application.
Stopping its controller closes the job and terminates descendants. Connector
exit also stops development sessions; reconnect does not auto-start them. Report
port conflicts and verify exact identity and project ownership before stopping
a process started elsewhere. Never kill an unrelated process by port alone.
Development servers and previews bind loopback. Existing deployment actions and
immutable release/rollback semantics remain separate.

Resolve environment references only at the local execution boundary, without
rewriting the application's existing environment/settings files. Do not expose
raw application output, connection strings or credentials in the browser or
evidence. Production database profiles require verified read-only credentials;
reject writable or unverifiable Production profiles. Database migrations and
Production writes remain outside this task and retain their approval boundary.
Do not start a customer backend against an ambiguous existing database during
acceptance. Prove the execution path with isolated fixtures and report the exact
customer services and database modes actually verified.
