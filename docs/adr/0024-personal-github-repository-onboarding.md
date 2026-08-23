# ADR 0024: Discover personal GitHub repositories through the Windows companion

- Status: Accepted
- Date: 2026-08-23

## Context

The personal Windows UAT installation needs to register repositories without a
repository name, owner, or provider credential being hard-coded into the web
application. The IIS host may not have unrestricted internet access, while the
owner's laptop already has an authenticated GitHub CLI credential. Provider
tokens must not be copied into the browser or FrevOS database.

## Decision

Use the existing authenticated Windows companion as a bounded discovery
transport for personal UAT. An authorized FrevOS user queues a GitHub discovery
operation. The companion reads the current GitHub account and at most 50
repositories through `gh api`, then returns only account and repository
metadata. FrevOS persists that metadata under the requesting workspace.

The user selects one verified, non-archived repository and may assign an
optional client and project display name. FrevOS creates the workspace project
and a repository connection in one transaction. The provider account token
remains in the GitHub CLI credential store and is never submitted to the BFF,
browser, or PostgreSQL.

This decision generalizes discovery and project registration only. Existing
TrackGRN build, deploy, commit, pull-request, and merge operations remain pinned
to their explicit allowlist until a separate per-project execution profile and
workspace installation identity are implemented.

## Consequences

- New repositories can be registered from the Control Center without source
  changes or browser token entry.
- Discovery depends on the companion laptop being online and authenticated to
  GitHub.
- Repository metadata can become stale and is refreshed by another explicit
  discovery operation.
- This personal-UAT credential model is not the future multi-user Production
  identity model; a GitHub App remains the intended scalable execution model.

## Rejected alternatives

- Saving a personal access token in browser storage, application settings, or
  PostgreSQL.
- Requiring the IIS server to make direct GitHub calls.
- Accepting arbitrary repository URLs that were not returned by the verified
  account discovery.
- Automatically granting generic build, deploy, push, or merge authority to a
  newly registered repository.

## Related decisions

- [ADR 0002](0002-workspace-isolation.md)
- [ADR 0003](0003-controlled-tool-gateway.md)
- [ADR 0015](0015-postgresql-tenant-isolation.md)
- [ADR 0022](0022-trackgrn-uat-automation-pilot.md)
- [ADR 0023](0023-trackgrn-human-approved-squash-merge.md)
