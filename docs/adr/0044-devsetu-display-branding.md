# ADR 0044: DevSetu display branding

Status: Accepted, owner-requested, 2026-10-22.

The product owner selected DevSetu and explicitly requested deployment without
backend, database or functional changes. DevSetu supersedes FrevOS as the visible
product name. Login, shell, accessible labels, page metadata, favicon, connector
setup prompts and native picker title adopt the new name with the existing theme.
The product-owned server20 default workspace label is presented as DevSetu Internal;
its stored name, ID and authorization are unchanged. Other workspace names remain
user data and are displayed verbatim.

Keep existing package names, cookies, environment variables, routes, Git remotes,
repository names, task/service/IIS names, filesystem paths and database identifiers.
Historical evidence and artifact manifests retain their original identities.
A global source replacement was rejected because it would require identity and
data migrations outside the owner's requested scope. No new product capability,
schema migration, customer application deployment or Phase 4 exit is implied.

Use the existing immutable server20 release boundary with a fresh approval bound
to this branding artifact. Verify application backend and migration file hashes
against the previous release before promotion. Retain private backups and the
existing release recovery path. Connector payloads keep their original filenames
for compatibility; only displayed copy changes.

Related: [ADR 0043](0043-project-master-and-deployment-workspace.md),
[ADR 0038](0038-server20-internal-http.md).
