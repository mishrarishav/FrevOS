# FrevOS Architecture

## Architectural intent

FrevOS separates user experience, orchestration, repository integration,
model-assisted reasoning, isolated execution, deterministic release and
deployment, and audit. The control plane owns authority and state; models are
replaceable decision assistants.

This document describes target boundaries, not implemented capability. See
[Current State](CURRENT_STATE.md) for what exists today.

## System context

```text
Desktop / Mobile PWA
          |
          v
FrevOS Control Plane ---- GitHub App / Outlook / Calendar
  |       |       |
  |       |       +---- Project Memory and Audit
  |       +------------ Provider-neutral Model Router
  +-------------------- Persistent Job Queue
                              |
                              v
                    Isolated Cloud Workers
                    /       |          \
             repository   tests      artifacts
                                          |
                                          v
                              Windows Deployment Agent
```

External systems are separate trust boundaries. A connection grants only the
explicit scopes recorded for one workspace and target.

## Logical planes

### Experience plane

The desktop web and mobile PWA expose repository onboarding, projects, task
timelines, agent runs, pull requests, evidence, releases, deployments,
approvals, audit, notifications, and future office workflows. The client is not
an authorization boundary and does not hold long-lived infrastructure secrets.

### Control plane

The control plane owns authentication, workspaces, membership, clients,
projects, repository connections, task orchestration, policy, approvals, audit,
project memory, model routing, job state, and notifications. It verifies
workspace scope before any downstream operation.

### Repository plane

A GitHub App provides repository-scoped authorization. FrevOS records the
provider repository ID, installation ID, owner, name, canonical URL, default
branch, and a permission snapshot. Webhook input is authenticated, replay
protected, normalized, and treated as untrusted until authorized.

### Agent plane

The Task Orchestrator may delegate reasoning to repository analysis, planning,
coding, QA, review, release, deployment, office, and maintenance agents. Agents
receive bounded context and tools. They do not receive ambient authority or
become independent principals.

### Execution plane

Cloud workers run persistent jobs in isolated, ephemeral workspaces. A worker
checks out the exact authorized repository and revision, executes an allowlisted
task, captures evidence, and destroys the workspace according to retention
policy. Closing the client must not terminate the job.

### Deployment plane

The future Windows agent is a separate high-trust deterministic service. It
prefers an outbound connection, validates signed requests against a local
allowlist, verifies artifact integrity, backs up, deploys only to configured
targets, checks health, reports evidence, and rolls back according to approved
policy. It never hosts a model or accepts arbitrary remote PowerShell.

## Repository onboarding

1. Normalize the submitted URL and reject unsupported forms.
2. Resolve the authenticated user, workspace, and intended project.
3. Verify the GitHub App installation and required repository permissions.
4. Fetch canonical repository identity and default-branch metadata.
5. Persist the connection and permission snapshot within the workspace.
6. Create an isolated checkout for a pinned revision.
7. Detect languages, frameworks, commands, structure, CI/CD, deployment
   indicators, risks, and unknowns using deterministic inspection where possible.
8. Produce a source-linked proposed project configuration.
9. Use a pull request for repository-side onboarding changes when required.
10. Require human review before activating consequential automation.

Local filesystem paths are execution details, never durable project identity.

## Task orchestration

For each user request, the orchestrator:

1. Resolves and authorizes the workspace, project, and actor.
2. Loads approved configuration and source-linked project memory.
3. Classifies intent, data sensitivity, and risk.
4. Creates a bounded, persistent task plan.
5. Selects agents and model providers allowed by project data policy.
6. Requests approval before crossing a protected boundary.
7. Invokes only controlled, authorized tools.
8. Records state transitions and correlated audit events.
9. Collects test, security, review, and artifact evidence.
10. Returns a factual result with limitations and next actions.

Idempotency keys and persistent task state prevent accidental duplication when
a client reconnects or a worker retries.

## Controlled tool gateway

Meaningful side effects pass through versioned business-level tools. Every tool
contract defines its identifier and version, input and output schemas, required
scopes, workspace scope, risk level, approval policy, timeout, idempotency
behavior, audit action, redaction rules, and error contract.

The gateway re-authorizes the actor and target at invocation time. It does not
trust a model-generated claim of permission. Unrestricted host shell, arbitrary
file deletion, raw Production database access, arbitrary email sending, remote
PowerShell, service restart, and server commands are prohibited tool surfaces.

An allowlisted command runner may exist only inside an isolated execution job
and only with resource, network, time, and output limits.

## Model routing

Domain requests use FrevOS-owned interfaces and types. Provider adapters
translate at the infrastructure boundary. Provider names, SDK clients, request
objects, and response objects must not leak into the domain.

Model selection considers task capability, workspace policy, project data
classification, provider eligibility, cost, and availability. Deterministic
code—not a model—enforces permissions, policy, Git operations, artifact hashes,
deployment, rollback, health checks, and audit creation.

## Workspace isolation

All project-related records carry a non-null workspace identity. Authorization
checks membership and action scope; data access applies the same workspace
constraint independently. Background jobs, cache keys, object-store paths,
search indexes, memory retrieval, audit queries, and telemetry must preserve the
boundary.

An object identifier without verified workspace context is insufficient for
access. Cross-workspace operations fail closed and produce safe audit evidence.

## Repository change workflow

```text
Pinned source revision
  -> dedicated branch
  -> bounded patch
  -> lint / type / unit / integration checks
  -> independent relevant QA
  -> complete diff and security review
  -> commit and pull request
  -> external review and policy approval
  -> merge by an authorized actor
```

Agents never push to the default branch or merge their own pull requests.
Production implementation cannot silently edit independent acceptance tests.

## Release and deployment integrity

One source commit produces one versioned immutable artifact containing or
linking its source SHA, build run, creation time, cryptographic digests, SBOM,
provenance, and signing metadata where applicable. UAT and Production retrieve
the same verified digest; Production-specific rebuilding is prohibited.

Promotion, deployment, health, and rollback are distinct state transitions.
Each checks authorization, approval, target allowlists, artifact identity, and
audit persistence.

## Project memory

Project memory stores source-linked facts such as architecture, commands,
business rules, decisions, known issues, pull requests, and deployments. It is
workspace and project scoped and invalidated or refreshed when source commits
change. Model-generated assumptions remain unverified until linked to a source
or explicitly approved.

## Repository topology

`mishrarishav/FrevOS` is the production modular monorepo. Runtime directories
will be created only when a phase needs them. `FrevOS-Acceptance` remains a
separate black-box QA repository. The optional UI lab and Windows deployment
agent are separate because they have different trust and lifecycle boundaries.

See [ADR 0001](adr/0001-repository-topology.md).

## Decisions intentionally deferred

Phase 0A does not select the application language, web framework, cloud vendor,
identity provider, database, queue, cache, object store, observability stack,
model providers, artifact signer, or deployment transport. Those choices need
explicit requirements, threat analysis, and ADRs before implementation.
