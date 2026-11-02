# DevSetu read-only teams and Paperclip task records

This is the ADR 0080 extension of the existing Agents pilot. DevSetu runs its
configured agents, using their own model connections, skills, versioned memory
and guardrails. Paperclip is an optional private task backend. It receives a
parent issue, one child issue per specialist/coordinator, sanitized results and
completion states. This does not turn on Paperclip's independent agent runners.

## Using Agents

1. Configure and successfully test each model connection under **Agents → Model
   connections**. Match output/timeout limits to the actual provider. A model
   connection marked unavailable is never treated as ready by a team request.
2. Configure at least two enabled agents with their skills, memory and evidence
   sources. The coordinator's source permissions must include every source
   permitted for any specialist. Workspace summaries must also be allowed by
   every applicable model connection; an external task backend has a separate
   sharing policy.
3. Open **Agents → Team tasks**. Select a coordinator, one to four specialists,
   an optional workspace project and a question. No identities, project names,
   providers, service URLs or model aliases are built into the team flow.
4. Leave sharing unchecked for DevSetu-only analysis. If a Paperclip binding is
   enrolled, explicitly choose whether this question and its results may be
   shared with that account's dedicated company. Enrollment is not a claim of
   fresh connectivity; the actual request checks the company and passive agents.
5. Click **Run read-only team**. Specialists run sequentially, followed by
   coordinator synthesis. The dialog polls persisted history, can be closed
   while a task runs, and reports individual failures. Full agent runs remain
   in existing Run history; technical references are collapsed by default.

Suitable questions include project assignment, related paired-device evidence,
latest observed activity, accepted milestone completion, schedule variance,
missing bindings and suggested next steps. Folder-name matches are candidates;
assignment is not proof of who edited a file. Missing plans mean unknown
completion. A team's answer is still model-generated advice; the underlying
deterministic facts remain authoritative. The bridge neither improves model
weights nor makes a small Qwen model universally reliable.

No code changes, Git pushes, deployment, shell commands, database writes,
notices or personnel decisions are performed by this team flow. Existing
separate approval-controlled workflows stay separate. The current gateway
does not return verified usage/billing; UI says **unavailable** rather than
inventing token counts or costs. Specialist results handed to the coordinator
are bounded and may be truncated; full canonical runs remain available.

## Operator enrollment

Disabled by default: `DEVSETU_PAPERCLIP_BINDINGS` is absent or `[]`.
Set it to a JSON array of this schema through the existing protected runtime
configuration process. This is an operator setting, not a user-editable URL or
an arbitrary proxy. Changing live credentials/access or activating a release
needs its own exact approval and preimage; this implementation does not do it.

```json
[
  {
    "version": 1,
    "workspaceId": "ws_example",
    "actor": "usr_example",
    "origin": "http://127.0.0.1:3100",
    "companyId": "11111111-1111-4111-8111-111111111111",
    "allowInternalHttp": true,
    "allowWorkspaceSummary": false,
    "secretReference": "env:DEVSETU_PAPERCLIP_SERVICE_TOKEN"
  }
]
```

These are placeholders, not a preconfigured service/company. Use the approved
private IPv4 literal and exact port; the origin must contain no path, query,
fragment or credentials. HTTPS verifies normal TLS; plaintext private HTTP
requires the explicit opt-in shown above. No DNS resolution or redirect can
change the destination. Do not expose the service publicly. Keep its network
and service access limited to the enrolled control plane.

The referenced token is supplied by the operator's existing secret mechanism
to that environment variable. Never put its value in JSON, source, screenshots,
logs, model prompts or browser requests. The reference is resolved only at the
HTTP boundary. No token is returned to the browser. Use a dedicated passive
company and service identity whose Paperclip access is restricted to it. An
unauthenticated `local_trusted` instance is only suitable for a disposable
loopback synthetic test, never a shared deployment.

The API must support the pinned contract:

- `GET /api/companies/:companyId` and `/api/companies/:companyId/agents`;
- `POST /api/companies/:companyId/issues` with `parentId`, explicit `backlog`
  and no agent assignee;
- `GET /api/issues/:id`, and `PATCH /api/issues/:id` with a result comment and
  terminal `done` status.

Use a separate company for each workspace/actor binding. Shared company IDs
and duplicate actor bindings are rejected. All company agents must be paused
or terminated (an empty company is valid). The bridge does not create/hire
agents or grant them tools. Unassigned backlog issues and neutralized `@`
mentions avoid waking independently privileged workers. DevSetu's actual agent
names/roles appear in task steps; they are not Paperclip assignees. Verify
remote RBAC and keep the company passive rather than relying on the UI label.

## Failure, recovery and storage

Each request has an actor/workspace-bound idempotency key. An identical replay
returns its persisted task; changed content with the same key conflicts. At
most one team runs per workspace process, with at most five existing agent
runs per team. Agent/model revisions and access are checked between steps;
failure stops further synthesis. There is no automatic inference/write retry.

External writes have durable intent and result audit entries. A timeout after
the remote server accepts a write is ambiguous: the team fails, keeps known
references and never repeats the write automatically. Use the parent task's
correlation reference in the dedicated company to reconcile any orphan issue.
Audit or result persistence failure never exposes an unpersisted final answer.
After a process restart a running task is shown as interrupted, with no replay.
Previously completed steps remain available. A fresh request is a new action.

Keep the existing agent-workspace directory and protected secret store in
backups. The team extension adds only `at_*.json` and bounded audit records;
it does not rewrite existing model/agent record formats, pairing or databases.
At most 100 team records are retained per workspace directory, the latest 50
are listed per actor, and capacity exhaustion fails explicitly. Embedded step
summaries are bounded; canonical agent runs retain the full evidence. Existing
agent-run and audit capacity limits still apply. No background cleanup deletes
customer data.

Rollback to the preceding runtime leaves these additive records intact. A
rollback does not undo external Paperclip task records or already consumed
model calls. Preserve both systems' backups and reconcile by correlation ID.

See [the implementation handoff](PAPERCLIP_TEAM_BRIDGE_HANDOFF.md) for observed
tests, source pins, live qualification, limitations and the separate activation
boundary. [ADR 0080](adr/0080-paperclip-read-only-team-bridge.md) records scope.
