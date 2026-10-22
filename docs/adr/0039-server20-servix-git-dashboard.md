# ADR 0039: Server20 Git and Servix development deployment

Status: Accepted for this owner-selected, bounded development pilot; not a generic provider rollout.
Date: 2026-10-21.

## Context

The owner selected `http://10.9.69.20/` as the deployment dashboard and explicitly
clarified the GitHub/Coolify analogy: local commits are pushed to server20; FrevOS
on server20 builds that pushed commit and deploys to server21. A laptop worker,
automatic commits of working-tree edits, and Codex Cloud are excluded.
Server21 `D:\servixDev` is the authorized development target. `D:\Servix` is
production and excluded. Existing uploads, environment and database files remain
on the target.

## Decision

Add the named `frevos` remote to `D:\servixDev`, preserving GitHub `origin`.
The private bare repository is `E:\FrevOS\git\servix.git`, with provider identity
`gitrepo_6cb7e163f807493fa37963196c49fbac`, fixed host DCAPP7 and branch `frevos-dev`.
Verify that identity as well as the repository path. Existing SMB connectivity
provides Git transport; this adds no public Git service or firewall rule. This
owner-selected local Git pilot is an explicit exception to the GitHub App-only
repository identity model; it grants no authority to other repositories.

The authenticated `ws_server20` deployment endpoint requires `project:write`,
same-origin CSRF and a versioned fixed-profile request. It records the actor,
request ID, selected immutable commit and expiry before execution. Retries reuse
one request ID; an uncertain activation prevents further deployment.

Builds run on server20 as LOCAL SERVICE in isolated Git exports, with an explicit
child environment excluding FrevOS/database/transport secrets. The trusted
operator packages backend/src, querysafe/src and generated frontend files only.
Frontend dependencies come from its committed lockfile with install scripts
excluded. Backend dependency changes fail the existing-runtime preflight and
require a separate dependency release. This is an owner-trusted source build,
not a container isolation claim or a general multi-tenant build service.

A separate fixed SYSTEM activation task consumes an actor/workspace/target/commit/
artifact/expiry-bound request exactly once. Approval bytes and artifacts are
recreated in private storage, avoiding writable ACL retention from NTFS moves.
Server21 credentials are resolved at this boundary from a SYSTEM DPAPI credential
file, excluded from builds and browser responses. Only the exact server21 address
was added to the server20 WinRM client's existing TrustedHosts list, retaining
its previous value privately. No firewall, VPN or target WinRM policy changed.

Reuse the tested Servix source-only preservation operator. It validates the
manifest/archive/files and installed dependency ranges before stopping only the
owned development task, backs up changed code with a write-ahead journal, checks
health and protected-file hashes, and verifies the production process/IIS
configuration remain unchanged. Recovery restores code; it does not roll back
SQL state. Normal application startup may bootstrap the development database.

## Consequences and alternatives

The owner runs normal `git commit` and `git push frevos`; Deploy selects only
committed, pushed changes. The laptop can then disconnect. No laptop queue worker
or GitHub token is required. The server20 and server21 Windows services/tasks,
private SMB transport and outbound npm connectivity remain operational dependencies.

The larger unified deployment worktree, customer data import, generic providers,
production Servix deployment and Phase 4 exit are not declared complete by this
pilot. Backend package/lock updates, reboot acceptance and interrupted remote
activation recovery need separate evidence before broader readiness claims.

See [the handoff](../SERVIX_DASHBOARD_HANDOFF.md) for actual verification and limits.
