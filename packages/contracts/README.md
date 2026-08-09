# `@frevos/contracts`

This package owns the smallest provider-neutral contracts shared across future
FrevOS components. It currently defines:

- branded opaque identifiers;
- required workspace and project scopes;
- normalized `resource:action` permission scopes;
- closed risk levels;
- target, digest, artifact, and approval bindings;
- safe validation results that do not echo untrusted input;
- JSON Schema Draft 2020-12 exports.

The package does not contain persistence models, API transport envelopes,
provider SDK objects, tool implementations, agent behavior, or UI types.

Use runtime schemas at every untrusted boundary and derive TypeScript types from
those schemas. Do not create parallel hand-written interfaces that can drift.
