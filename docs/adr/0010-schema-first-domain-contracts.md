# ADR 0010: Define strict runtime-validated, workspace-scoped contracts

- Status: Accepted
- Date: 2026-08-09

## Context

TypeScript types disappear at runtime and cannot defend trust boundaries.
FrevOS will receive untrusted data from clients, repositories, webhooks, models,
workers, and external providers. Loose objects can silently discard unexpected
fields or lose workspace context, leading to authorization and audit failures.

## Decision

Use Zod 4 schemas as the source of truth for foundational boundary contracts and
derive TypeScript types from those schemas. Export JSON Schema Draft 2020-12 for
provider-neutral interoperability.

Phase 1 contracts:

- use prefixed, branded, path-safe opaque identifiers;
- require workspace identity for every workspace/project scope;
- reject unknown fields in scoped and approval objects;
- define normalized lowercase `resource:action` permission scopes;
- define a closed low/medium/high/critical risk vocabulary;
- bind approvals to approver, actor, workspace, optional project, action,
  normalized target, correlation, time window, and optional artifact/payload
  digests;
- require expiration after issuance;
- normalize validation issues without returning raw input values.

Persistence, API, provider, and UI models must adapt to these contracts rather
than changing them implicitly.

## Consequences

- Runtime and static validation originate from one definition.
- Workspace omissions and unexpected fields fail closed.
- JSON Schema consumers can share deterministic structural definitions.
- Cross-field rules not expressible in portable JSON Schema still require the
  FrevOS runtime validator.
- Contract changes require compatibility review and tests.

## Rejected alternatives

- TypeScript-only interfaces at external boundaries.
- Permissive schemas that silently strip unknown fields.
- Database entities as cross-component domain contracts.
- Provider-specific request/response types in shared packages.
- Validation errors that echo raw untrusted payloads.
