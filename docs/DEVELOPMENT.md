# FrevOS Development Guide

## Prerequisites

- Node.js `24.19.0`, pinned in `.node-version`.
- pnpm `11.21.0`, pinned in the root `packageManager` field.
- Git with a dedicated task branch based on the intended default-branch commit.
- Docker for the Phase 4B PostgreSQL integration and isolation suite.

Node.js 24 is the supported LTS line. Use the pinned patch in CI and normal
development; the package engine range is a compatibility floor, not permission
to ignore security updates.

## Setup

```sh
corepack enable
pnpm install --frozen-lockfile
```

Do not use npm or yarn to create additional lockfiles. Dependency changes must
update `package.json` and `pnpm-lock.yaml` together.

## Commands

| Command | Purpose |
| --- | --- |
| `pnpm validate:repo` | Validate required docs, Markdown links, and desired ruleset |
| `pnpm format` | Apply Biome formatting |
| `pnpm format:check` | Verify formatting without changing files |
| `pnpm lint` | Run the Biome recommended linter rules |
| `pnpm typecheck` | Type-check every workspace package |
| `pnpm test` | Run unit tests |
| `pnpm test:coverage` | Run tests with enforced V8 coverage thresholds |
| `pnpm build` | Build every workspace package |
| `pnpm audit` | Fail on high or critical known dependency vulnerabilities |
| `pnpm run ci` | Run the complete local CI sequence |

Run the Phase 3 Control Center locally with:

```sh
pnpm --filter @frevos/control-center dev
```

The Control Center uses deterministic demonstration data and must not be
configured with credentials or Production endpoints.

Build and validate the Phase 4B control plane with:

```sh
pnpm --filter @frevos/control-plane build
pnpm --filter @frevos/control-plane test:coverage
```

The control-plane tests start immutable PostgreSQL `18.4` and Testcontainers
helper images. Runtime and privileged migration configuration are documented in
[`apps/control-plane/README.md`](../apps/control-plane/README.md). Never use a
real provider credential in local or CI test configuration.

The deployment migration command requires `MIGRATION_DATABASE_URL` and the
separate runtime `DATABASE_URL` from an approved process-local secret boundary:

```sh
pnpm --filter @frevos/control-plane build
pnpm --filter @frevos/control-plane migrate
```

It applies migrations with the first credential, derives only the non-secret
login role name from the second, and grants `frevos_app` only after that runtime
login passes the unprivileged-role checks. Never type either URL into shell
history. See the [Phase 4 UAT runbook](PHASE_4_UAT_RUNBOOK.md).

Build the same-origin non-Production image with:

```sh
docker build --tag frevos:phase4-uat .
```

The Dockerfile pins Node.js 24.19.0 by multi-platform digest, installs from the
frozen lockfile, builds both runtimes, copies the runtime package and migrations,
and runs as the unprivileged `node` user.

Generated `dist/`, `coverage/`, `node_modules/`, and TypeScript build metadata
are ignored and must not be committed.

## Package conventions

- Packages use native ESM and explicit `.js` extensions in relative imports.
- Source belongs in `src/`; tests belong in `test/`; build output belongs in
  `dist/`.
- Public APIs are exported through a package `index.ts` and `exports` map.
- Boundary data uses strict runtime schemas; TypeScript types alone do not
  validate untrusted input.
- Project-related contracts include a required, validated workspace identity.
- Validation failures return normalized issue paths and never echo raw input.
- Provider SDK types, database records, transport objects, and UI models do not
  become domain contracts.

## Dependency policy

- Use exact direct dependency versions and the committed pnpm lockfile.
- Keep strict peer dependency resolution and store-integrity verification on.
- New packages require a clear need, license/security review, and complete CI.
- Dependency build scripts are denied unless explicitly allowlisted.
- Dependabot proposes grouped weekly npm and GitHub Actions updates.
- GitHub Actions remain pinned to full commit SHAs with version comments.

Phase 4B adds exact MIT-licensed releases of Fastify, `@fastify/cookie`,
`openid-client`, `pg`, Zod, Testcontainers PostgreSQL, and the `pg` type
declarations. Phase 4 same-origin packaging adds the exact MIT-licensed,
security-patched `@fastify/static` `10.1.2` release. Transitive native/metadata
install scripts from optional
Testcontainers paths remain explicitly denied because local Docker execution
does not require them. `skipLibCheck` is enabled only in the control-plane
TypeScript project to isolate an upstream `openid-client` declaration conflict
with `exactOptionalPropertyTypes`; FrevOS source still uses every root strictness
option, and removal of this compatibility exception is required once upstream
types support the pinned TypeScript line.

## CI and merge

The `CI / validate` job runs repository validation, formatting, linting,
type-checking, coverage, build, and dependency audit with read-only repository
permissions. Local success is required before publication, but GitHub CI remains
the canonical clean-environment result.

Do not make the check mandatory in the `main` ruleset until it has succeeded on
`main` once. Follow [Merge Policy](MERGE_POLICY.md) for the complete human merge
boundary.
