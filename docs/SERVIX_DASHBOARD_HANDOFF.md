# Servix dashboard deployment handoff

Status: PASS - server20 dashboard deployment, target health and protected-file readback verified.
Date: 2026-10-21 (IST).

## Scope and identity

FrevOS repository/worktree: `D:\FREVOS\.local\worktrees\servix-dashboard`.
Branch: `feature/servix-dashboard-deploy`.
Base/current Git HEAD: `bc4530746c01269b3795a25edad63efad9364b9f`.
No FrevOS commits, GitHub pushes, PRs or merges were performed.
The server20 internal-HTTP patch was copied from its dedicated worktree as the
installed baseline; the original worktree and all unrelated work were preserved.

The owner selected this exact flow:

1. Edit and commit locally in `D:\servixDev`.
2. Normal `git push` pushes HEAD to server20's `frevos-dev` branch.
3. Click **Deploy Servix dev** at `http://10.9.69.20/deployments/deploy-72`.
4. Server20 exports that immutable Git commit, installs locked frontend
   dependencies from its own cache, builds, backs up and activates only server21
   `D:\servixDev`, then verifies health and preservation.

This is a fixed Servix development pilot, not general multi-project deployment,
container isolation, completed REA adoption, Phase 4 exit or whole-product readiness.
Codex Cloud and the laptop-data import remain deferred/pending in their existing
worktrees. No persistent laptop worker was installed. The short pre-push publisher
runs during Git push; builds and activation run on server20.

## Installed configuration

- Server20: `DCAPP7 / 10.9.69.20`, FrevOS `http://10.9.69.20/`.
- Final active application manifest:
  `b0c939abcf14a9d7767e0ac3f31c55d3c8346d2d024646ac08b8dec660ac0084`.
- Application ZIP SHA256:
  `1eeac10511ebcedd326a0e94672c065108564e80faed028c5536a85480c18df4`.
- Manifest payload: 3,662 files. Public origin, local authentication, PostgreSQL
  connection and sibling IIS sites are preserved. No FrevOS schema migration,
  reset or data import was performed.
- Runtime key: `FREVOS_SERVIX_DEPLOYMENT_ROOT=E:\FrevOS\servix`.
- Controller/build identity: LOCAL SERVICE; privileged fixed activation task:
  `FrevOS-ServixDev-Activation`, SYSTEM, startup trigger with restart settings.
- Private Git: `E:\FrevOS\git\servix.git`, repository identity
  `gitrepo_6cb7e163f807493fa37963196c49fbac`, branch `frevos-dev`.
  Git rejects non-fast-forward pushes and ref deletion.
- Laptop remote: `frevos=//10.9.69.20/e$/FrevOS/git/servix.git`;
  `remote.frevos.push=HEAD:refs/heads/frevos-dev`; `remote.pushDefault=frevos`.
  GitHub `origin` and fetch configuration are preserved. Existing global Git
  configuration was backed up before adding only the exact trusted UNC directory.
- A previously absent `.git/hooks/pre-push` was installed. Its shell guard exits
  immediately for other remotes, preserving GitHub push behavior. The owned
  publisher is copied into `.git/frevos/Publish-GitDependencies.cjs`; it uses
  npm's existing `pacote` and `cacache`, verifies source identity and locked
  package integrity, and publishes only public npm packages for this profile.
- Server20 registry probe returned ECONNRESET. No VPN/firewall rule was changed.
  Bootstrap transferred 1,517 tarballs in one verified archive; server-side npm
  cache verification confirmed all 1,517 content objects / 219,540,882 bytes.
  Lock cache key: `3a305ccd8dfa2519dc149bb46828731764375586326a1fd36682793654c4c5ae`.
  Code-only pushes reuse the published lock cache. Changed locks validate existing
  cached content and publish missing packages during push.
- Source repository commit:
  `ce4b102efb66217ef5c8398975dfe4d7ad83119a`, parent `275738d58bea2308f7065da5d57f2241c4181ee5`.
  Only `frontend/package-lock.json` was committed: two missing SunEditor download
  URLs were added; versions and integrity values stayed unchanged. The backend
  working edits, untracked utilities/tests and prior operator tools stayed uncommitted.
- Server20-to-server21 WinRM authentication on 5985 passed. Only `10.9.69.21` was
  appended to the client's existing TrustedHosts value, with a private backup.
  Target credentials are SYSTEM DPAPI protected under the private controller
  directory. They never enter the build environment, browser, source Git or logs.

## Target and data protection

Server21 is `DCAPP9 / 10.9.69.21`; development frontend is IIS `servixDev` on 82,
backend is the owned `ServixDev-FrevOS-Backend` task on 5001. Database identity is
`10.9.69.31:3306 / servix_db_dev`. Browser URL: `http://10.9.69.21:82/login`.
The reused launcher disables development outgoing/incoming mail and scheduled
mail-like activity using local-only switches.

`D:\Servix` production is excluded. Deployment packages only backend/src,
querysafe/src and generated frontend files. It never mirrors an application root
or packages uploads, environment files, database folders or node_modules.
Installed dependency ranges are checked before stopping the development task.
Changed code is backed up with a write-ahead journal and guarded rollback.
Existing protected-file SHA256s and the production PID/creation time plus global
IIS configuration digest are compared during activation. Normal development app
startup may perform its own SQL bootstrap; this is not a database-byte/row
preservation or SQL rollback claim.

The prior baseline had 139 upload files and 145 protected files including SQL
files and two environment files. Production backend PID was 10760, created
2026-09-28T04:36:15.3371830Z. Final readback verified all 104 deployed code files and all 145 protected-file SHA256s with zero differences. All 139 upload files remain present. Development PID is 8688, created 2026-10-20T22:22:02.3841710Z, with the expected development marker; the owned task is running. Production PID/creation time stayed exactly unchanged.

## Verification and corrections

- Frozen dependency installation and `pnpm run ci`: exit 0; 193 tests passed
  (73 contracts, 69 Control Center, 51 control plane), required coverage, types,
  formatting/lint, application build and audit passed. Final audit reported no
  known vulnerabilities. Vite was patched to 8.2.4 in the dev dependency and all
  affected transitive paths using a bounded override, without weakening gates.
  The [maintainer advisory](https://github.com/advisories/GHSA-587h-7wmj-h5pm)
  explains the newly reported range that caused an intermediate audit failure.
- `Test-ServixDashboardRelease.ps1`: exact package verification, bounded delta,
  wrong-manifest-digest denial, database-migration-delta denial, PowerShell syntax
  and reserved-variable checks passed for the final package.
- `Test-ActivationFiles.ps1`: repeated atomic publication/previous state passed
  on Windows PowerShell. The first live worker failed because PowerShell 5.1
  converted a null File.Replace backup string to an empty path. The producer now
  keeps one explicit previous file. Intermediate sealed worker artifact
  `125d672f3a19bd1f0819312781e9b359f61341d672749138f51b552f4781922b`
  proved advancing heartbeat; the final application release now owns this fix.
- Visible Edge acceptance found `crypto.randomUUID` unavailable on the requested
  internal HTTP origin. Request ID creation now uses cryptographic getRandomValues
  inside the handled operation. A regression runs with randomUUID absent.
  The failed clicks before that fix created no server deployment job.
- The first accepted job `sd_134fcd0f53d0db42444c52f2548881a8` failed before
  source extraction. A real LOCAL SERVICE replay reproduced missing LASTEXITCODE
  with the sanitized environment and passed after restoring PATHEXT. The owning
  environment boundary and secret-isolation regression were fixed.
- Native commands now use their real exit code and separate private stdout/stderr
  sinks. A Windows Job Object owns the build controller and descendants so that
  controller exit/termination closes the group rather than leaving npm children.
  `Test-BuildProcess.ps1` passed locally and under server20 LOCAL SERVICE: benign
  stderr, failed exit code, nested build-group initialization and descendant exit.
  Build failures retain structured stage/type/line metadata, excluding raw secrets.
- Final FrevOS activation: local health/UI 200, sibling IIS sites preserved;
  temporary outer operator tasks removed. Source inventory matches the final
  packaged inputs. All failed/superseded artifacts remain separate, immutable
  evidence; none were overwritten to hide acceptance failures.
- Final visible-browser POST returned 202 and selected source commit `ce4b102...`:
  request `sd_c481d5da2681bab87bf83586c256f500`, actor `usr_windows_admin`,
  workspace `ws_server20`, expiry 2026-10-20T22:52:05.917Z.
  The run succeeded at 2026-10-20T22:22:12.890Z. Artifact manifest SHA256 is `4498bf9ed4ae688639f37ce1bc5613fc7a0447ddd69759874144657adbe2741c`, release ID `77a899085ad9466aaedf900e56f1573e`, with 104 code files. Observed end-to-end time was about 10 minutes 7 seconds; npm reported 1,678 packages installed in 7 minutes. This timing is a single observed run, not a cold/warm performance benchmark. Subsequent duplicate POST returned the same succeeded request and kept job count at 2, proving no duplicate activation. Visible Edge showed the succeeded row and the Servix login page; the latter returned health 200 / OK with auth/full bootstrap ready. Both pages reported zero JavaScript page errors.

## Known limits

- Backend package/lock/start-script changes are not deployed by this source-only
  profile. New or incompatible backend dependencies require a separate release;
  they fail preflight before task stop.
- Public registry tarball dependencies are supported by the pre-push publisher;
  private registries, Git dependencies and another laptop/repository require
  explicit profile/onboarding work.
- Reboot acceptance and authenticated Servix business flows were not tested.
  Filesystem rollback fixtures and prior artifact-denial evidence do not establish
  a real failed-health activation rollback in this new dashboard route.
- Consumed uncertain activations are never replayed; they block further deployment
  for operator reconciliation. Full private receipts/backups remain under the
  controller and target runtime directories. Build/checkouts are retained; ongoing
  retention/garbage collection is not implemented by this bounded pilot.
- Build CPU/memory costs and cold/warm deployment performance were not benchmarked.
  Server20 prerequisite probe observed 32 GB RAM / about 17 GB free and 46.7 GB
  free on E before the acceptance run.

## Evidence locations

Private `.local/` operator records in this worktree:
`servix-activation-final/{job,result-plan,result-apply}.json`, `servix-release.json`,
`servix-ci-final-release.log`, `servix-cache-import/result.json`,
`servix-git-push-final.log`, `servix-git-ls-diagnostic/`.
The initial cache upload was stopped after its exact owned process identity was
verified, then replaced by the bulk import to avoid thousands of slow SMB writes.
Git refs were not advanced until the subsequent successful normal push.

Final evidence: `.local/servix-target-acceptance.json`, `.local/servix-success.json`, `.local/servix-final-readback/result.json`, `.local/servix-browser-acceptance.json`, `.local/servix-dashboard-success.png`, `.local/servix-live-after-dashboard.png`. The readback prototype first wrapped the JSON array as one nested item; correcting that diagnostic parser verified all 145 individual hashes. No protected file was restored or rewritten to obtain that result.


The final UI-only rollout used .local/servix-activation-ui/ and retained the successful target deployment. Scoped history styles were visually checked in Edge. Maintenance preflight now distinguishes completed retained claims from active/uncertain deployment ownership; six regression scenarios and the live completed-claim upgrade passed. After re-authentication, the final dashboard showed the succeeded row, enabled Deploy button and ready runner; Servix health remained 200 / ready, with zero page errors. Final documentation validation passed; source/metadata/code changes remain uncommitted in the dedicated FrevOS worktree.

## Complete changed-file inventory

Includes the copied HTTP baseline and this pilot; generated/private `.local` artifacts are excluded.

- `apps/control-center/package.json`
- `apps/control-center/src/App.tsx`
- `apps/control-center/src/ServixDeploymentPanel.tsx`
- `apps/control-center/src/api.ts`
- `apps/control-center/src/deployment-request-id.ts`
- `apps/control-center/src/styles.css`
- `apps/control-center/test/api.test.ts`
- `apps/control-center/test/deployment-request-id.test.ts`
- `apps/control-plane/README.md`
- `apps/control-plane/src/config.ts`
- `apps/control-plane/src/main.ts`
- `apps/control-plane/src/server.ts`
- `apps/control-plane/src/servix-deployment.ts`
- `apps/control-plane/test/crypto-config.test.ts`
- `apps/control-plane/test/postgres-service.integration.test.ts`
- `apps/control-plane/test/servix-deployment.test.ts`
- `apps/control-plane/test/servix-execution.test.ts`
- `deployment/server20/Apply-InternalHttp.ps1`
- `deployment/server20/Apply-ServixDashboard.ps1`
- `deployment/server20/HttpCommon.ps1`
- `deployment/server20/New-InternalHttpRelease.ps1`
- `deployment/server20/New-ServixDashboardRelease.ps1`
- `deployment/server20/Start-Server20.ps1`
- `deployment/server20/Test-HttpArtifact.mjs`
- `deployment/server20/Test-InternalHttp.ps1`
- `deployment/server20/Test-ServixDashboardRelease.ps1`
- `deployment/server20/Test-ServixDeploymentIdle.ps1`
- `deployment/server20/Verify-HttpManifest.mjs`
- `deployment/servix/ActivationFiles.psm1`
- `deployment/servix/Build-DevRelease.cjs`
- `deployment/servix/Build-Servix.ps1`
- `deployment/servix/BuildProcess.psm1`
- `deployment/servix/DeploymentFiles.psm1`
- `deployment/servix/Import-PackageCache.cjs`
- `deployment/servix/Import-PackageCache.ps1`
- `deployment/servix/Install-ActivationRunner.ps1`
- `deployment/servix/Invoke-DevRelease.ps1`
- `deployment/servix/Invoke-DevTarget.ps1`
- `deployment/servix/Provision-Servix.ps1`
- `deployment/servix/Publish-GitDependencies.cjs`
- `deployment/servix/Run-Activation.ps1`
- `deployment/servix/Run-DevBackend.ps1`
- `deployment/servix/Test-ActivationFiles.ps1`
- `deployment/servix/Test-BuildProcess.ps1`
- `deployment/servix/reused-operator.json`
- `deployment/servix/web.config`
- `docs/CURRENT_STATE.md`
- `docs/SERVER20_HTTP_HANDOFF.md`
- `docs/SERVIX_DASHBOARD_HANDOFF.md`
- `docs/adr/0038-server20-internal-http.md`
- `docs/adr/0039-server20-servix-git-dashboard.md`
- `docs/adr/README.md`
- `packages/contracts/src/auth-cookies.ts`
- `packages/contracts/src/index.ts`
- `packages/contracts/src/servix-deployment.ts`
- `packages/contracts/test/auth-cookies.test.ts`
- `pnpm-lock.yaml`
- `pnpm-workspace.yaml`

Diff stat (tracked diff plus new text files): 58 files; 4156 additions; 124 deletions.

