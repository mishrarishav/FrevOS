# ADR 0013: Use Fastify for the control-plane service boundary

- Status: Accepted
- Date: 2026-08-10

## Context

Phase 4 introduces the first service boundary. The repository already uses
Node.js 24, TypeScript, native ESM, Zod runtime contracts, and JSON Schema
exports. FrevOS needs explicit request lifecycle hooks, route-level input and
output schemas, bounded plugin ownership, predictable shutdown, and testable
dependency injection without choosing a cloud provider.

Fastify 5 supports the repository's Node.js line, requires complete schemas for
request parts, supports response serialization schemas, and provides
encapsulated plugin and lifecycle boundaries. Its documentation also separates
synchronous structural validation from asynchronous authorization and data
access in later request hooks.

## Decision

- Build the Phase 4 control-plane HTTP service with Fastify 5 on Node.js 24.
- Keep routes thin and register identity, session, workspace authorization,
  persistence, and future capability areas as encapsulated plugins.
- Validate every untrusted route boundary with a complete schema and define
  explicit response schemas to reduce accidental data disclosure.
- Adapt FrevOS-owned Zod contracts at the transport boundary; Fastify request,
  reply, plugin, and error types must not enter domain packages.
- Perform membership, authorization, and database work after structural input
  validation in lifecycle hooks or application services, never inside schema
  validation.
- Construct the server separately from starting the listener so unit and
  integration tests can use injection without opening a network port.
- Add bounded request, body, and handler timeouts and graceful shutdown before
  any deployed runtime is claimed.

Phase 4A records this decision but does not create the service runtime. That is
owned by Phase 4B after the contracts are reviewed.

## Consequences

- The service aligns with the existing TypeScript and schema-first foundation.
- Plugin encapsulation makes protected and public routes visibly distinct.
- Transport schemas and domain schemas require an explicit compatibility
  boundary rather than implicit type reuse.
- Fastify and its plugins become security-sensitive dependencies requiring
  exact versions, lockfile review, audit, and upgrade testing.
- Cloud hosting, ingress, regional strategy, and horizontal session storage
  remain separate deployment decisions.

## Rejected alternatives

- Adding route handlers directly to the Vite application.
- Selecting a full-stack web framework that combines UI rendering and control
  plane authority before deployment requirements exist.
- Using Node's HTTP primitives and rebuilding lifecycle, schema, injection, and
  shutdown conventions locally.
- Performing database lookups from schema validators.

## Evidence

- [Fastify v5 migration guide](https://fastify.dev/docs/v5.2.x/Guides/Migration-Guide-V5/)
- [Fastify validation and serialization](https://fastify.dev/docs/latest/Reference/Validation-and-Serialization/)
- [Fastify encapsulation](https://fastify.dev/docs/latest/Reference/Encapsulation/)
- [Fastify lifecycle](https://fastify.dev/docs/latest/Reference/Lifecycle/)

## Related records

- [ADR 0009](0009-foundation-toolchain.md)
- [ADR 0010](0010-schema-first-domain-contracts.md)
- [Phase 4 foundation](../PHASE_4_FOUNDATION.md)
