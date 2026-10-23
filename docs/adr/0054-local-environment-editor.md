# ADR 0054: Generic local environment variable CRUD

Status: Accepted for the owner-requested development pilot, 2026-10-24.

The owner explicitly requests simple UI CRUD for the variables already present
in a connected project's `.env` files, including the local Production preview
profile. This bounded extension is stacked on the deployed local-development
pilot at `c572f8c9d89332643a3e672be3b654c21cbc6b7d`. It supersedes ADR 0053 only
where that ADR forbids editing existing environment files and submitting new
variable values. Phase 4 exit remains open; no subsequent roadmap phase starts.

Use discovered service IDs and existing `.env` references, never Servix-specific
paths or a remote file/shell editor. Present key/value rows with Add, edit,
Delete, Cancel and Save changes. Do not add unrelated configuration. Existing
credentials and unclassified values remain masked and are never returned to the
browser. Only a small validated set of ordinary host/schema/port/mode/boolean
values may be displayed. Blank untouched inputs retain their saved values;
explicit empty replacements and deletions are distinct changes.

Encrypt replacement values in browser memory to a fresh connector public key
using X25519, HKDF-SHA256 and AES-256-GCM. The control plane persists only the
sealed request and safe metadata. Resolve replacements only at the enrolled
connector. Bind authenticated, explicit Save approval to the single-use request,
actor, workspace, profile, device, service, file, document revision, observation
and expiry. Reconnection or key change never blindly replays an uncertain save.
Do not store draft values in browser storage, application logs or evidence.
Encryption does not replace HTTPS or protect a compromised browser/source host.

Require a fresh source and stopped managed services; reject observed unmanaged
project listeners. Check path/link ownership and the file's HMAC revision again
before writing. Edit existing files only, retain comments and unchanged lines,
and keep the existing file path and permissions. Reject unsupported or
ambiguous syntax without rewriting it. Update local configuration freshness
after a successful save so an ordinary restart uses the new profile. Save never
starts a service, changes a database, deploys an application or rotates an
underlying database account. Production read-only startup checks remain intact.

The owner's requested environment Save is the explicit human approval surface
for replacing/removing a value in this local profile. It grants no authority
for actual database writes, credential-provider lifecycle or live server files.
Verify with synthetic fixtures, real browser CRUD and secret-leak assertions;
do not edit real customer environment values as an acceptance exercise.
