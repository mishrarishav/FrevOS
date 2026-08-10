# ADR 0012: Use React and Vite for the Control Center experience

- Status: Accepted
- Date: 2026-08-10

## Context

Phase 3 introduces the first FrevOS application runtime: a responsive web
experience shell and design system derived from the approved Lovable reference.
The repository already uses Node.js 24, pnpm 11, TypeScript 7, native ESM,
Biome, and Vitest. Cloud provider, identity, service API, and deployment hosting
remain unresolved and must not be selected indirectly by prototype code.

The reference uses React, Vite, Tailwind, TanStack libraries, and a large UI
dependency set. Its experience is approved, but its dependency graph and
full-stack prototype architecture are not.

## Decision

- Build the Phase 3 Control Center as a private React 19 application under
  `apps/control-center`.
- Use Vite 8 for development and a portable static production build.
- Use strict TypeScript 7 and the existing repository-wide Biome and Vitest
  toolchain.
- Implement semantic tokens and responsive components with production-owned
  CSS custom properties instead of importing the prototype's Tailwind and
  generated component stack.
- Use the browser History API behind a small application navigation boundary
  for Phase 3 routes. Select a larger router only when data loading,
  authentication, or nested-route requirements justify it.
- Use Lucide's React package for the approved icon language.
- Keep all Phase 3 data local, deterministic, and visibly disclosed as
  demonstration data. Add no fetch client, provider SDK, authentication,
  storage, analytics, or service runtime.

## Consequences

- Phase 3 remains portable while cloud, identity, and service decisions stay
  open.
- The product preserves the approved visual language without inheriting the UI
  Lab's prototype ownership or broad dependency surface.
- A later phase can add a router, server rendering, or a backend-for-frontend
  through a superseding ADR if evidence requires it.
- Static HTML output is not an authorization boundary and cannot contain
  long-lived secrets.
- Browser-level interaction and accessibility acceptance require a deployed
  Preview or UAT target and remain independent from component-unit validation.

## Rejected alternatives

- Copy the Lovable repository into the production monorepo.
- Adopt the reference's complete dependency graph without a production need.
- Select a full-stack framework before authentication, session, API, hosting,
  and cloud requirements exist.
- Use a server-rendered framework in Phase 3 only to create static shell data.
- Build a bespoke icon set instead of the approved Lucide vocabulary.

## Related records

- [ADR 0001](0001-repository-topology.md)
- [ADR 0009](0009-foundation-toolchain.md)
- [Phase 3 UI reference](../UI_REFERENCE.md)
