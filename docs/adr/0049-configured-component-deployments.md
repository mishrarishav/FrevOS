# ADR 0049: Configured component deployments

Status: Accepted for the owner-requested development pilot, 2026-10-22.

The owner requests the platform's source-to-deploy workflow, independent
frontend/API/microservice destinations and a reusable configuration-driven
onboarding standard. This supersedes ADR 0046's prepared-release-only product
scope when a configured platform pipeline is enrolled. It does not grant access
to server21 `D:\Servix` production or authorize database migrations.

Keep the working Servix adapter as an explicit compatibility path while adding
a reusable pipeline engine. Existing Servix source history, five protected paths,
running development release and credentials must remain unchanged during rollout.
Do not retarget that fixed adapter from generic caller input. New projects use
revisioned component configuration and logical central repository IDs, with
authenticated bundle transport rather than a mandatory GitHub provider.

A project owns components with build context, recipe, immutable output, enrolled
builder, enrolled destination binding, dependency graph and persistent paths.
The source connector commits once per deployment request. Build workers use an
isolated checkout and locally enrolled toolchains. Destination workers pull exact
artifacts and can affect only locally enrolled roots/runtime identities. No
browser-supplied shell or credential is accepted. Enrollment secrets remain
DPAPI protected; API records retain hashes. Builders run without administrator
privileges. The native platform adapter executes outside the process it replaces.

Deploy all follows an acyclic dependency graph. A failure blocks dependents and
preserves independently successful components; report partial outcomes rather
than claim transactionality. Each component has its own current and previous
saved artifact. Rollback never rewrites source or database data. Snapshot actor,
change context, source identity, revision, destination and protection in the run.
Idempotency and target ownership are checked before queueing. A claimed target
job interrupted without a receipt requires recovery, never blind replay.

Configuration, local integration and actual remote acceptance are distinct.
Keep unpaired connections/draft components visibly unavailable. Report the exact
tested recipes, hosts and restart/recovery limits before calling them ready.
