# ADR 0048: Server20 source identity

Status: Accepted for the owner-requested Servix development pilot, 2026-10-22.

The owner explicitly replaces GitHub as the Servix source reference with the
existing server20 central Git repository. ADR 0039 already created the fixed
repository identity and ADR 0040 moved transport to authenticated Git bundles.
The remaining GitHub-origin comparisons are stale and block the intended flow.

Use `//10.9.69.20/e$/FrevOS/git/servix.git`, remote `frevos`, identity
`gitrepo_6cb7e163f807493fa37963196c49fbac` and branch `frevos-dev`. This is the
existing internal repository locator, not a new public clone service. Source
transfer continues over scoped authenticated bundle endpoints, without sharing
server Windows credentials. A shared contract owns source-proof matching across
backend tests, folder completion and deployment readiness. Generic draft projects
retain their existing origin semantics.

Servix diagnostics/publication select the central named remote, independent from
an optional legacy GitHub `origin`. Do not retarget/delete the legacy remote.
Installation binds an existing checkout only after verifying an authenticated
central bundle and common ancestry; an existing conflicting `frevos` remote is
rejected. Only a remote-tracking ref and missing central remote may be added;
working tree, index and HEAD are not reset. New clones use the central binding.
The server continues verifying its pinned Git ID, expected base, ancestry and
compare-and-swap central ref before publication. A displayed locator alone does
not grant source or destination authority.

Update the live revisioned Servix project through the existing owner/CSRF settings
operation, preserving all destination and protected-path values and keeping the
old configuration in history. No database migration, new Git service/firewall rule,
customer deployment/rollback or server21 production change is authorized here.

The source worker's strict job-key boundary must also admit ADR 0047's validated
change context; its former whitelist rejected that producer payload before Git.
Verify the actual claimed-job contract as well as commit/bundle behavior, rather
than claiming direct publication-function tests prove worker acceptance.

Related: [ADR 0039](0039-server20-servix-git-dashboard.md),
[ADR 0040](0040-portable-developer-connectors.md),
[ADR 0047](0047-deployment-change-records.md).
