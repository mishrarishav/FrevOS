# ADR 0009: Use a minimal Node.js and TypeScript workspace toolchain

- Status: Accepted
- Date: 2026-08-09

## Context

FrevOS needs shared contracts, later web and service components, deterministic
validation, and a modular monorepo. The foundation should support end-to-end
types without selecting a web framework, cloud provider, database, or
orchestration runtime prematurely.

TypeScript 7 is the current production release and uses a native compiler, but
does not yet expose the programmatic compiler API expected by some lint tooling.
Node.js 24 is the current LTS line; Node.js 26 remains a Current release.

## Decision

- Use the Node.js 24 LTS line and pin the current approved patch in
  `.node-version` and CI.
- Use pnpm 11 with an exact `packageManager` version and pnpm workspaces.
- Use native ESM, NodeNext resolution, strict TypeScript 7, and explicit package
  exports.
- Use Biome 2 for formatting and linting, avoiding a dependency on TypeScript's
  programmatic compiler API.
- Use Vitest 4 with V8 coverage for package unit tests.
- Add no monorepo task framework until workspace scale demonstrates a need.

## Consequences

- Contracts and future TypeScript components can share one language/toolchain.
- The workspace stays small and understandable during early phases.
- Tool versions and the lockfile require deliberate security maintenance.
- Framework-specific type checking may require TypeScript 6 compatibility until
  those ecosystems support TypeScript 7; the Phase 3 UI decision will reassess.
- A future non-TypeScript high-trust component may live in its own repository
  without changing domain boundaries.

## Rejected alternatives

- Node.js 26 Current as the Production baseline.
- A web framework selection before the UI and API phases.
- npm/yarn lockfiles alongside pnpm.
- TypeScript-ESLint during the TypeScript 7 compiler-API transition.
- Turborepo or Nx before task-graph scale requires it.
