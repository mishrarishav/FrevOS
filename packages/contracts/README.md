# `@frevos/contracts`

This package owns the smallest provider-neutral contracts shared across future
FrevOS components. It currently defines:

- branded opaque identifiers;
- required workspace and project scopes;
- normalized `resource:action` permission scopes;
- closed risk levels;
- target, digest, artifact, and approval bindings;
- safe validation results that do not echo untrusted input;
- provider-neutral external identity and token-free server-session context;
- workspace, membership, client, and project boundaries;
- deterministic explicit-scope workspace authorization decisions;
- JSON Schema Draft 2020-12 exports.

The package does not contain persistence models, API transport envelopes,
provider SDK objects, provider tokens, database records, transport cookies,
tool implementations, agent behavior, or UI types.

`authorizeWorkspaceAction` evaluates server-constructed session, workspace, and
membership evidence. Runtime shape validation does not make evidence supplied
by a client trustworthy; protected services must load that evidence from the
server-side session and workspace stores.

Use runtime schemas at every untrusted boundary and derive TypeScript types from
those schemas. Do not create parallel hand-written interfaces that can drift.
