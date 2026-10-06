# Server 20 dependency prerequisite handoff

Date: 2026-10-07. Local dependency validation: **PASS**. Server 20 hosting:
**not deployed**. This bounded task does not complete the active hosting goal.

## Scope and repository

- Repository: `https://github.com/mishrarishav/FrevOS`.
- Worktree: `D:\FREVOS\.local\worktrees\dependency-audit`.
- Branch: `fix/server20-dependency-audit`.
- Base: `43eb9a0e29ec88882c9a1a922e03d7b8a28113fa` (merged `main`).
- This is the preparation record included in the publication candidate. The
  resulting immutable commit SHA, draft PR URL, final diff stat and remote CI
  results are recorded in the publication handoff/PR metadata after creation.
- Active roadmap: Phase 4 exit; this is a dependency-maintenance prerequisite,
  not implementation or approval of a later roadmap phase.

Included: compatible dependency updates, lockfile regeneration, local regression
validation, and factual task evidence. Excluded: server installation, credentials,
database/schema writes, IIS/certificates/firewall, application behavior changes,
customer apps, unrelated dirty worktrees and merge. Existing server
services and all other worktrees were preserved.

The owner explicitly approved commit, push and draft-PR publication for this
dependency task on 2026-10-07. Only the dedicated task branch may be pushed;
the human owner must review and squash-merge it. This approval is not Production
execution authority, permission to publish unrelated work, or agent self-merge.

## Complete changed-file list

1. `apps/control-plane/package.json`: Fastify 5.11.3 to 5.12.5.
2. `package.json`: Vitest and its V8 coverage provider 4.1.10 to 4.1.11.
3. `pnpm-lock.yaml`: the above plus compatible indirect updates for fast-uri,
   brace-expansion, undici, grpc-js and source-map-js.
4. `docs/CURRENT_STATE.md`: bounded prerequisite and publication approval status.
5. `docs/SERVER20_DEPENDENCY_HANDOFF.md`: this evidence and handoff.

Complete preparation diff stat: **5 files, 252 insertions, 96 deletions** before
the publication-status documentation update; final totals are in the PR handoff.

No major-version migration, override, audit exception, dependency-age reduction,
peer-check relaxation, test change or threshold reduction was introduced. The
exact pnpm 11.21.0 and existing Node/TypeScript/Vite baselines are unchanged.

## Commands and observed results

Commands ran in the dedicated worktree using Node 24.19.0 and pnpm 11.21.0.

| Command/check | Observed result |
| --- | --- |
| Baseline `pnpm.cmd audit --audit-level=high --json` | Exit 1; metadata: 23 high, 14 moderate, 4 low, no critical |
| `pnpm.cmd update -r --no-save fastify fast-uri undici brace-expansion '@grpc/grpc-js' source-map-js --reporter=append-only` after the Fastify manifest edit | Exit 0; narrow indirect updates under existing parent ranges |
| Intermediate high-level audit | Exit 0; no high/critical, two moderate test-tool findings remained |
| `pnpm.cmd install --reporter=append-only` after the matched Vitest/coverage manifest edits | Exit 0; matched 4.1.11 tool family resolved |
| `pnpm.cmd install --frozen-lockfile --reporter=append-only` | Exit 0; manifest/lockfile consistent |
| `pnpm.cmd run ci` | Exit 0; repository, formatting, lint, types, coverage tests, build and audit passed |
| `docker build --tag frevos-dependency-audit:20261007 .` | Exit 0; pinned Linux non-Production runtime image built locally |
| `docker run --rm --network none --entrypoint node frevos-dependency-audit:20261007 -e <boundary-check>` | Exit 0; CI runtime boundary checks plus exact packaged Fastify version passed |
| `pnpm.cmd audit --json` after all dependency changes | Exit 0; all severity counts zero |
| Final `pnpm.cmd run validate:repo`, `pnpm.cmd run format:check`, `git diff --check` | Exit 0 each; 47 Markdown files valid, formatting and tracked whitespace clean |

The boundary check is the Node script in `.github/workflows/ci.yml`'s
`Validate runtime image boundary` step, with the extra assertion that
`/opt/frevos/control-plane/node_modules/fastify/package.json` is version 5.12.5.
It checks UID 1000, built entrypoint/migration/UI assets, absence of application
source/test directories, and absence of browser source maps. No ports, volumes
or credentials were provided to this ephemeral check; it was automatically
removed by `--rm`.

Local image ID observed with `docker image inspect`:
`sha256:82fc736c8b179fd70332e3964483122b458665964524daa1dfbf3c7638bebbcc`.
This is a local validation image from an uncommitted dependency branch, not a
reviewed Production artifact, and it was not pushed or deployed. Later edits
were documentation only; the runtime inputs remained unchanged.

An initial `pnpm.cmd ci` invocation exited 0 but resolved to pnpm's built-in
clean-install command, not the repository script. It is not test evidence.
The explicit `pnpm.cmd run ci` above was then run and completed successfully.

Test totals: contracts 71, control-center 66, control-plane 41: **178 passed**.
Control-plane integration tests used disposable Docker PostgreSQL, not server
20 or the saved Production connection profile. Coverage thresholds were kept:

| Package | Statements | Branches | Functions | Lines |
| --- | --- | --- | --- | --- |
| contracts | 100% | 100% | 100% | 100% |
| control-center | 100% | 100% | 100% | 100% |
| control-plane | 96.64% | 90.88% | 99.4% | 97.01% |

The final CI audit reported **No known vulnerabilities found**. This is a
point-in-time dependency audit, not an exhaustive source/security review,
container-OS scan, proof of exploitability, or guarantee of future safety.
Private advisory details and credentials are not included in this report.

Complete manifest/lockfile and documentation diffs were reviewed. The changed
file set contains only the five files above. A bounded known-secret-format
check passed; this is not an exhaustive history or image secret scan.

## Native Windows packaging follow-up

The next goal continuation rechecked the dedicated branch and canonical remote
`main`; both base/HEAD values were the SHA above. Publication was absent then.
The following additional local-only check completed with exit 0:

`pnpm.cmd --config.node-linker=hoisted --filter @frevos/control-plane deploy --prod <fresh-check-directory>/control-plane`

The fresh ignored directory is
`.local/server20-native-check-341d6c306f694b72babdcd36fd44d181` inside this worktree.
No existing output was replaced. Native Node 24.19.0 on Windows successfully
imported the packaged server/database/config modules; all four compiled operator
and runtime entrypoints plus the initial SQL migration were present. The output
contained 3,643 files and zero symbolic links, so module resolution does not rely
on a link back to the development checkout. Fastify resolved to exactly 5.12.5.
The config parser accepted the proposed IP HTTPS origin, empty base path, local
auth and loopback:10000; it rejected HTTP and origins containing a path. No
database connection, credential resolution, listener or remote action occurred.

This is an unpruned dependency-export smoke check, not a release ZIP, clean
source artifact, full Windows Server 2016 startup or Production acceptance.
The old Windows UAT builder/launcher is fixed to server9, `/frevos`, its UAT
origin and `D:\FrevOS-UAT`; it was inspected but not executed or repurposed.
The Production server20 profile/installer remains separate unfinished work.

## Server recheck and remaining boundaries

Read-only Kerberos access to `dcapp7.eesl.co.in` succeeded after confirming the
single IPv4 target `10.9.69.20`. The remote hostname was DCAPP7 and the current
domain operator was elevated. Ports 8443, 8085, 10000 and 5433 were free;
`E:\FrevOS` was absent and no FrevOS/PostgreSQL service was found. Existing IIS
sites remain present, global ARR proxy is disabled, and no valid private-key
certificate was found in LocalMachine My. No remote settings were changed.

The intended IP-only origin can use HTTPS; a domain is not required. Existing
FrevOS configuration/cookies require HTTPS, so plain remote-IP HTTP is not an
equivalent ready-to-use login profile. The owner subsequently approved
`https://10.9.69.20:8443`, a fresh `frevos` database and a new administrator.
This is hosting-profile selection, not a certificate installation or an
artifact-bound Production deployment approval. Its implementation/ADR belongs
to the separate server20 rollout task, not this dependency patch.

This patch belongs to merged-baseline `main`, not the unmerged multi-server UI,
local-runner, database-helper or native PostgreSQL setup branches. Those changes
must not be silently dropped or merged into a release without review. Normal
publication and human squash merge remain required before release use. The
prepared PostgreSQL-only installer, actual Windows Server 2016 native startup,
Production DB/app bootstrap, immutable release and bound deployment approval,
backups/restore, and visible live login verification remain separate gates.

Ready for the authorized draft publication of this bounded dependency task;
not evidence that FrevOS is live or generic remote deployment is implemented.
