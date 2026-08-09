# ADR 0004: Keep model providers behind domain-neutral adapters

- Status: Accepted
- Date: 2026-08-09

## Context

FrevOS initially expects a strong coding model but future work may use different
enterprise, specialist, free-tier, or local providers. Provider SDK objects in
domain contracts would couple policy, storage, orchestration, and tests to one
vendor and make project data policy difficult to enforce consistently.

## Decision

The FrevOS domain defines provider-neutral model requests, capabilities,
results, usage metadata, and error categories. Infrastructure adapters translate
between those types and approved provider SDKs.

The model router selects an eligible adapter using task capability, workspace
policy, project data classification, privacy and retention requirements, cost,
and availability. Provider identity and relevant usage remain auditable, but
provider request/response types do not leak into the domain.

Models assist with reasoning. Deterministic code remains authoritative for
permissions, policy, Git operations, build/test execution, artifact hashing,
deployment, health checks, rollback, and audit creation.

## Consequences

- Adapter conformance tests and normalized failure behavior are required.
- Provider-specific features need explicit capability negotiation.
- Swapping providers is possible but not assumed to be behaviorally identical.
- Data policy can deny a provider before project content is disclosed.

## Rejected alternatives

- Exposing one provider's SDK objects throughout the product.
- Letting each agent instantiate providers directly.
- Treating a model provider as an authorization or policy authority.
- Sending all available project context to every eligible provider.
