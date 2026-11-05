# ADR 0100: Code repository browser and scoped downloads

Date: 2026-11-05

Status: Accepted owner implementation request; validation and rollout pending.

Extend ADR 0076 on the explicit continuation of the live dc429dd task stack.
The owner requests a GitHub-style Code workspace showing actual Server20 source
repositories, branches, committed files/README/history and downloadable source
ZIPs, with the Discovery workspace design and simple per-user access sharing.
Keep local folder publication and existing branch/PR/recovery actions available.

Use the existing configured bare source stores and optional private Git hosting
adapter. Do not silently migrate refs, install another forge, expose arbitrary
server folders or present local unpushed changes as centrally published code.
Enumerate only approved source registrations, verify each immutable repository
identity and read committed Git objects without a checkout or executing files.
All addresses, paths, owners and exclusions come from trusted configuration.
Legacy repositories with no explicit owner start administrator-only. Newly
created hosted repositories retain their verified creator/provider ownership.

Reuse workspace membership and the configured administrator policy. Enforce
ownership/explicit read grants on every list, branch/tree/blob/history/archive
and access-management operation. Unknown and unauthorized repository IDs must
not disclose names or paths. Grants apply only to active members, are revision
checked and audited; revocation applies on the next request. A source-download
grant does not confer deployment rights or bypass engine Git/branch protection.
Legacy raw Git bundle export requires owner/publication authority; read-only
grants use the protected-path-filtered Code ZIP. Recheck access after export.
For hosted repositories, keep the engine's independent account/permission checks.

ZIP generation is bounded, authenticated, attachment-only and commit-bound.
Preserve configured protected paths and sensitive environment/key exclusions.
Never execute HTML/Markdown from repositories on the authentication origin.
Do not expose absolute storage paths, resolved credentials or a raw Git shell.
Source, uploads, environment, pairing, roles and deployment state remain intact.

Validate real bare-repository file/history/ZIP behavior, identity and traversal
rejection, cross-user/workspace/disabled-member denial, grants/revocation and
download authorization. Exercise desktop/tablet/mobile layouts, scrolling,
navigation and failed/empty states. Record actual configured Server20 inventory
and live acceptance separately from isolated fixtures and operator preparation.
