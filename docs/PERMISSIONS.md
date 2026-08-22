# FrevOS Permissions and Approval Model

## Purpose

FrevOS uses explicit, workspace-scoped capabilities. Authentication identifies
an actor; authorization decides whether that actor may perform one action on one
target; approval authorizes a protected transition but does not grant the
underlying permission.

The client, model, agent, and connected repository cannot mint permissions.
Every controlled tool invocation is authorized by deterministic policy.

## Actors

- **Human user:** authenticated workspace member acting through an approved
  client.
- **Service identity:** a narrowly scoped FrevOS component or worker identity.
- **Agent run:** a task-bound delegate using the initiating authority reduced by
  workspace policy, task scope, and tool policy.
- **External installation:** a GitHub App or office-provider grant bound to an
  installation/tenant and recorded scopes.
- **Deployment agent:** a separate service identity further restricted by its
  local target allowlist.

Agents and models are not autonomous security principals and never gain more
authority than the verified task permits.

## Permission shape

A permission decision evaluates at least:

```text
actor + workspace + project + action + target + environment + context
```

Artifact actions also include the artifact ID and digest. External-provider
actions include the relevant installation or consent grant. Absence or mismatch
of any required dimension results in denial.

Scope names were formalized in Phase 1. They follow a stable
`resource:action` convention, for example `repository:read`, `task:execute`, or
`deployment:request`, without embedding provider-specific SDK concepts.

Phase 4 membership records carry explicit scopes rather than granting authority
from a client-supplied role name. The authorization boundary requires an active,
unexpired server session; an active workspace; an active membership for the
same internal user and workspace; and an exact required scope. Wildcards and
ungranted actions are denied. Protected routes own their required scope; a
client cannot choose it.

The authorization context is assembled from server-side session and membership
lookups. Its schema validates evidence shape but does not make client-supplied
membership or scope claims trustworthy.

## Risk levels

| Level | Meaning | Default treatment |
| --- | --- | --- |
| Low | Read-only, narrow, low-sensitivity operation | Permission and audit |
| Medium | Reversible project change or sensitive read | Permission, policy, evidence, audit |
| High | External write, release, environment change, or broad access | Explicit scoped approval plus all controls |
| Critical | Production/destructive/secret authority | Explicit human approval, strongest binding, fail closed |

Risk may be raised by workspace policy, data classification, target environment,
scope breadth, unusual volume, or an untrusted input path. A model cannot lower
a deterministic risk classification.

## Protected action matrix

| Action | Minimum risk | Explicit approval | Notes |
| --- | --- | --- | --- |
| Read authorized repository metadata | Low | No | Workspace and installation scoped |
| Analyze pinned repository in isolation | Medium | Policy dependent | No permanent copy; bounded execution |
| Create a task branch | Medium | Policy dependent | Never the default branch |
| Apply a bounded patch | Medium | Policy dependent | Dedicated branch and complete diff evidence |
| Run allowlisted tests/builds in a worker | Medium | Policy dependent | Sandboxed with resource and network limits |
| Push a task branch | High | Yes unless an explicit workspace policy delegates it | Exact repository and branch |
| Create a pull request | High | Yes unless explicitly delegated | Never implies merge permission |
| Merge a pull request | High | Yes | Agent that authored it must not merge it |
| Destructive repository operation | Critical | Always | Target and effect must be exact |
| Build a release candidate | High | Policy dependent | Source commit and build identity recorded |
| Promote a release to Production | Critical | Always | Artifact ID and digest bound |
| Deploy to UAT | High | Policy dependent | Approved target and artifact required |
| Deploy to Production | Critical | Always | Single-use Production approval |
| Roll back Production | Critical | Always | Exact target and rollback artifact/state |
| Write to a Production database | Critical | Always | Separate narrowly defined tool only |
| Create/rotate/revoke a secret | Critical | Always | Secret value excluded from audit |
| Read authorized email | Medium | Policy dependent | Separate provider consent and data policy |
| Create an email draft | Medium | Policy dependent | Draft only; no implicit send |
| Send external email | Critical | Always | Exact recipients and content version bound |
| Read calendar/free time | Medium | Policy dependent | Minimum necessary fields |
| Propose a calendar event | Medium | Policy dependent | No invitations sent |
| Send a calendar invitation | Critical | Always | Attendees and event version bound |
| Broad permission change | Critical | Always | Actor, old/new grants, and target recorded |

The table defines minimums; workspace policy may be stricter but cannot weaken
actions marked “Always” without an approved architecture and security change.

## Approval record

An approval contains:

- approval ID and policy version;
- approving actor and authenticated session context;
- workspace and project;
- action and normalized target;
- risk level and human-readable impact summary;
- correlation and task IDs;
- artifact ID and digest where applicable;
- exact content version for an external message or invitation;
- creation, expiration, and consumption timestamps;
- decision and safe reason metadata.

Consumption is atomic, single-use, and checked immediately before execution.
Changing the action, target, environment, artifact, recipients, content, or
correlation requires a new approval.

## Separation of duties

- Creating a change does not grant permission to merge it.
- Building an artifact does not grant permission to promote or deploy it.
- Deploying to UAT does not grant permission to deploy to Production.
- Reading mail does not grant permission to draft or send.
- Drafting a message or event does not grant permission to send it.
- Voice input may request an approval flow but cannot satisfy it.
- Approval does not bypass validation, artifact integrity, target allowlists, or
  audit requirements.

## Controlled tool authorization

Each tool declares required scopes, workspace behavior, target normalization,
risk, approval policy, idempotency, timeout, audit event, redaction, and error
contract. The gateway checks the registered declaration rather than accepting
those values from a caller.

Tool output is filtered to the caller's workspace and task. A successful
provider API response does not prove FrevOS authorization and cannot replace a
local permission decision.

## TrackGRN UAT pilot delegation

Within `ws_uat_demo/prj_uat_trackgrn`, an authenticated user holding
`project:write` may explicitly click to request one registered pilot operation.
That request is action-, project-, requester-, and correlation-bound. A
commit/push request also contains the reviewed source SHA, change digest, and
edited commit message. It authorizes only a new `frevos/trackgrn-*` branch; it
does not authorize a default-branch push or merge. A deploy request authorizes
only the fixed non-Production IIS target and reviewed source SHA. Production,
rollback, backup, restore, secret changes, and arbitrary commands remain outside
this delegation.

## Decisions deferred

Product roles, membership invitation policy, service-account lifecycle,
emergency access, policy language, delegation limits, approval quorum, and
exact GitHub/Outlook/Calendar permission sets remain deferred. Phase 4A uses
explicit membership scopes and does not infer any of these policies. They
require use-case-specific ADRs and negative authorization tests before
implementation.
