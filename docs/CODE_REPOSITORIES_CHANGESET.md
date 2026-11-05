# Code workspace implementation changes

Status: PASS for focused implementation checks; release validation and activation
are pending. Repository: mishrarishav/FrevOS. Branch:
`codex/code-repository-workspace`. Base:
`dc429ddc033fd6346b5a7edcbac2d1ca0359c163`. No PR or GitHub publication is created.
The exact source commit/tree and diff stat are recorded in the frozen release
receipt before the original enrolled native build begins.

## Complete changed-file inventory

- `apps/control-center/src/App.tsx`
- `apps/control-center/src/CodePage.css`
- `apps/control-center/src/CodePage.tsx`
- `apps/control-center/src/RecordWorkspace.tsx`
- `apps/control-center/src/api.ts`
- `apps/control-center/test/code-browser.test.tsx`
- `apps/control-center/test/code-repositories-api.test.ts`
- `apps/control-plane/src/code-git.ts`
- `apps/control-plane/src/code-repositories.ts`
- `apps/control-plane/src/component-deployments.ts`
- `apps/control-plane/src/developer-connectors.ts`
- `apps/control-plane/src/git-engine.ts`
- `apps/control-plane/src/main.ts`
- `apps/control-plane/src/repository-center.ts`
- `apps/control-plane/src/server.ts`
- `apps/control-plane/test/code-repositories.test.ts`
- `apps/control-plane/test/code-routes.test.ts`
- `apps/control-plane/test/developer-connectors.test.ts`
- `apps/control-plane/test/git-engine-native.test.ts`
- `apps/control-plane/test/repository-center.test.ts`
- `deployment/server20/HttpCommon.ps1`
- `deployment/server20/New-ServixDashboardRelease.ps1`
- `docs/CODE_REPOSITORIES_CHANGESET.md`
- `docs/CODE_REPOSITORIES_HANDOFF.md`
- `docs/CURRENT_STATE.md`
- `docs/adr/0100-code-repository-browser-and-access.md`
- `docs/adr/README.md`
- `packages/contracts/src/code-repositories.ts`
- `packages/contracts/src/index.ts`
- `packages/contracts/test/code-repositories.test.ts`
- `scripts/test-private-git.cjs`

## Observed validation

Commands use the existing native build-environment whitelist for Windows
integration tests. Inheriting the interactive shell environment caused a new
real-Git test to time out; the unchanged 30-second gate passes in the sanitized
environment. Existing tests/timeouts/coverage thresholds are retained.

| Command or check | Observed result |
| --- | --- |
| `git diff --check` | Exit 0 |
| `pnpm run format:check` | Exit 0 |
| `pnpm run lint` | Exit 0; advisory diagnostics remain |
| `pnpm run validate:repo` | Exit 0 |
| `pnpm run typecheck` | Exit 0 |
| `pnpm run build` | Exit 0; existing chunk-size warning |
| `pnpm run audit` | Exit 0 at high threshold; 5 low / 8 moderate findings |
| Focused Code/Git/routes/connector suite | 34 tests pass across 4 files |
| Account integration, final Code pagination and routes | 9 tests pass across 3 files |
| Final connector authorization/export cleanup tests | 11 tests pass |
| Pinned native Gitea acceptance | PASS, actual clone/push/PR/RBAC/encrypted recovery and Code path |
| Contract coverage suite | 103 tests pass; global thresholds pass |
| Frontend coverage suite | 118 tests pass; API/experience/routing coverage 100% |
| Full backend coverage attempt | Interrupted after Docker container creation failed, before a complete report |
| First frozen native CI, a59d6ee | All 587 tests pass; statement coverage 94.69% fails the unchanged 95% gate |
| Code workspace/native-engine combined coverage | 10 tests pass; new-module statements 95.56%, branches 91.21%, lines 98.53%, functions 100% |

The Docker runtime failure reproduces independently of application code. After
Docker Desktop restart, the original four preview container IDs/images/mounts
match and all are healthy. The same actual account integration test passes.
The enrolled native builder must still run the complete frozen-source CI. No
partial local run is accepted as the final artifact gate.

The first complete frozen run is retained as failed validation; it created no
deployable artifact and performed no activation. Additional acceptance exercises
the Code workspace service itself against the real pinned Git engine for
catalog/tree/file/history/ZIP and revisioned provider grants/revocation. The
central-store cases additionally verify publication denial for read grants,
policy identity changes, conflicting registrations, concurrent ZIP capacity and
revocation while a ZIP is generated, oversized policies and branch quotas.
Hosted catalog/tree and grants use the actual workspace service. The existing
engine read proof checks file contents/history/ZIP in one fetched checkout;
central service tests exercise their full API paths. Duplicate newly added
fetches are removed after the expanded fixture times out; the final 10-test
combined run passes within the existing deadlines and all scoped gates. Existing
assertions and global gates are retained. Full frozen native CI must still pass.

Browser checks use labeled isolated design data in actual App/Code components.
See the handoff for dimensions, scrolling, navigation and access-control checks.
Live Server20 source observation is read-only and separate from browser fixtures.
The task changes neither live repository refs nor live user grants.

## Release preparation

The builder's two fixed packaging/delta sidecars are updated through the existing
typed Plan/Apply operator. Its DPAPI configuration, native adapter, task and ACL
remain byte-for-byte verified. This prepares the builder and does not activate
the Server20 application. The existing signed-installer identities and current
pairing/data/environment must be verified against the exact completed artifact
before application activation.
