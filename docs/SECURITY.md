# FrevOS Security Policy and Threat Model

## Security objective

FrevOS coordinates high-impact operations across source control, build systems,
cloud workers, releases, deployments, and office data. Its primary security
objective is to ensure that every action is attributable, authorized for one
workspace and target, policy compliant, minimally privileged, evidence backed,
and safe to retry.

When identity, scope, approval, artifact integrity, or audit persistence cannot
be established, FrevOS fails closed.

## Trust boundaries

- **User clients:** untrusted for authorization; authenticate every request.
- **Control plane:** authoritative for identity, policy, state, and approvals.
- **Model providers:** untrusted with authority and eligible only under project
  data policy.
- **Repository content:** hostile-capable input that may contain prompt
  injection, malicious build scripts, oversized data, symlinks, or secrets.
- **Cloud workers:** isolated execution boundaries with short-lived credentials.
- **GitHub and office providers:** external systems with separately scoped
  authorizations and verified callbacks.
- **Artifact storage:** integrity-sensitive boundary requiring immutable identity
  and digest verification.
- **Windows deployment agent:** separate high-trust boundary constrained by a
  local allowlist and deterministic protocol.
- **Acceptance evidence:** potentially sensitive output requiring redaction and
  retention controls.

## Non-negotiable controls

### Workspace isolation

- Every project-related record and operation has a verified workspace context.
- Authorization and data access each independently enforce the boundary.
- Jobs, caches, object keys, search, project memory, audit, and observability
  preserve workspace scope.
- User-supplied object IDs never replace a workspace-scoped lookup.
- Negative cross-workspace tests are release-gating once the relevant layers
  exist.
- Tenant database tables use non-null workspace keys, workspace-preserving
  foreign keys, forced PostgreSQL row-level security, and a non-owner runtime
  role without `BYPASSRLS`.
- Database workspace context is derived only from verified server authority and
  is transaction-local so pooled connections cannot retain tenant state.

### Authentication and authorization

- Use short-lived sessions and credentials with explicit audience and purpose.
- Use OpenID Connect Authorization Code with PKCE through a confidential
  backend; keep provider tokens out of the browser.
- Map external users by the exact issuer and subject pair, never by email.
- Give the browser only an opaque `Secure`, `HttpOnly`, `SameSite=Strict`,
  host-only session cookie and independently protect state-changing requests
  against CSRF.
- Reconstruct session, workspace membership, and scopes from server-side state
  for every protected request.
- Re-authorize consequential tool calls at invocation time.
- Separate read, propose/draft, approve, and execute permissions.
- Treat client-side visibility as presentation, never authorization.
- Record permission snapshots for external repository connections.
- Deny unknown actions and missing scopes by default.

### Repository safety

- Prefer GitHub App installation tokens over broad personal access tokens.
- Match a canonical provider repository ID, installation, owner, and name; do
  not rely only on a URL string.
- Verify webhook signatures, delivery freshness, event type, and repository
  identity; protect against replay.
- Use pinned revisions and isolated ephemeral checkouts.
- Never attach customer repositories as submodules or permanent copies.
- Prevent direct default-branch pushes and agent self-merge.

### Untrusted execution

- Analyze manifests before executing repository-defined commands.
- Run commands only in isolated workers with bounded CPU, memory, disk, time,
  process count, output, and network access.
- Do not mount control-plane credentials or host sockets into a worker.
- Use short-lived job-specific credentials and revoke them on completion.
- Validate paths against traversal, symlink escape, device files, and archive
  extraction attacks.
- Destroy or quarantine workspaces according to an explicit retention policy.

### Prompt-injection resistance

- Treat repository files, issues, pull requests, comments, logs, web pages,
  email, dependencies, and test output as data—not policy.
- Do not let retrieved content change tool permissions, approval requirements,
  destinations, or secret-access rules.
- Provide agents the minimum context and tool set required for one task.
- Validate model-proposed actions through deterministic policy and schemas.
- Display and audit the authorized action, not hidden model reasoning.

### Secrets and sensitive data

- Store opaque `SecretReference` values in domain records, never secret values.
- Resolve a secret only inside its authorized execution boundary.
- Do not send secrets to model providers or expose them in source, commits,
  pull requests, logs, prompts, traces, screenshots, videos, audit, or reports.
- Apply structured redaction before persistence and again before presentation.
- Mask known formats, constrain arbitrary output, and test redaction failure
  paths.
- Secret creation, rotation, and revocation require explicit approval and audit.

### Approval integrity

Approvals are single-use, expiring, actor-bound, workspace-bound,
action-bound, target-bound, and correlation-bound. Artifact transitions are
also digest-bound. Approval consumption is atomic and replay protected.

Voice input, model output, an old approval, or a generic “approve everything”
setting cannot authorize a protected action.

### Audit integrity

- Record actor, workspace, project, action, target, time, correlation ID, risk,
  outcome, safe metadata, and approval reference where applicable.
- Make events append-oriented and protect them from user or agent rewriting.
- Correlate user requests, model calls, tools, jobs, artifacts, approvals, and
  deployments.
- Do not persist secret values, raw tokens, or unnecessary customer content.
- Treat inability to persist a required audit event as a failure for sensitive
  actions.

### Supply-chain and artifact integrity

- Pin and verify dependencies according to the selected ecosystem policy.
- Scan source, dependencies, generated artifacts, and repository history for
  relevant secrets and vulnerabilities.
- Generate an SBOM and provenance for release artifacts where applicable.
- Bind each artifact to source commit and build run using cryptographic digests.
- Store artifacts immutably and verify digest and signature before deployment.
- Promote the same artifact to UAT and Production; never rebuild for Production.

The Phase 1 repository baseline additionally requires an exact package-manager
version, a committed lockfile, frozen CI installation, strict peer dependency
resolution, a minimum dependency release age, read-only workflow permissions,
immutable GitHub Action commit references, automated dependency update
proposals, and a high-severity dependency audit. These controls reduce exposure
but do not replace provenance, vulnerability response, or later artifact
signing.

### Deployment safety

- Keep the Windows deployment agent separate from the control plane and models.
- Prefer outbound-only connectivity and mutually authenticated requests.
- Configure targets locally; remote requests cannot supply arbitrary filesystem
  paths, service names, app pools, executables, or commands.
- Verify authorization, approval, environment, artifact, digest, signature, and
  idempotency before changing state.
- Back up, use safe replacement, check health, and execute only policy-approved
  rollback behavior.

## Threat register

| Threat | Required mitigation direction |
| --- | --- |
| Cross-workspace data access | Dual-layer scoping, negative tests, scoped caches and jobs |
| Repository URL substitution | Canonical provider ID and installation verification |
| GitHub token leakage | Short-lived installation tokens, isolation, redaction |
| Repository prompt injection | Treat content as data; deterministic authorization |
| Malicious build scripts | Sandboxed workers, minimal credentials, bounded network |
| Model-provider data exposure | Project data policy, minimum context, provider adapters |
| Tool abuse | Typed business tools, scopes, risk policy, approval, audit |
| Approval replay or confusion | Atomic single-use consumption and exact target binding |
| Artifact substitution | Immutable storage, digest/signature verification, provenance |
| Audit tampering | Append-oriented protected storage and correlated identifiers |
| Compromised deploy agent | Local allowlist, least privilege, mTLS/signatures, rotation |
| Unsafe rollback | Approved policy, artifact identity, backup verification, health |
| Outlook over-permissioning | Separate read/draft/send grants and explicit send approval |
| Voice spoofing | Voice cannot independently approve sensitive actions |
| Evidence leakage | Redaction, access control, retention, safe failure capture |

## Security validation expectations

As relevant capabilities are introduced, validation must cover authorization
denial, workspace isolation, permission downgrade, webhook replay, prompt
injection, path traversal, egress controls, secret redaction, approval expiry
and replay, idempotent retries, audit failure, artifact mismatch, unauthorized
Production actions, and deployment rollback behavior.

Phase 0A validation is limited to documentation consistency and diff review; it
does not claim that runtime security controls exist.

## Open security decisions

The identity provider, credential vault, tenant enforcement mechanism, worker
sandbox technology, network-egress policy, data classification, encryption key
ownership, audit retention, evidence retention, artifact signing, vulnerability
response policy, and deployment transport require later ADRs before their
respective implementation phases.

Security issues must not be placed in public logs or normal project memory.
The private reporting and incident-response channel is not yet selected.
