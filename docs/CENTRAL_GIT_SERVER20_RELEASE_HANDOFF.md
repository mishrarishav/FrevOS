# Central Git Server20 release

Status: PASS for the bounded implementation, validation, GitHub publication and
configured Server20 platform deployment under ADR 0078. Phase 4 remains open;
live Git-engine enrollment and other acceptance limits below remain distinct.

Repository: mishrarishav/FrevOS (provider repository ID 1329122983).
Branch: codex/central-git-collaboration.
Implementation base: e5b1122ad95323b46beab3789672d2cb6ca2d9cd.
Canonical GitHub main: 5730940fe6c40cc3eb5002ef6beaa564c9571e5f, an ancestor.
Published implementation: 88e6420717898b6633bce86308053c3fa8b01314.
PR: https://github.com/mishrarishav/FrevOS/pull/41 (draft, unmerged).
Current deployment request: pr_bd4bd6a5a50a05ec0bb1ca293e55774b.
Configured source publication: 074b9e5b33770434142facfd0d9bb6dc54c081c7,
an empty deployment-record commit over b82e17e. Its implementation tree matches
c0568e7, which fixes fresh Windows test-engine preparation. Publication is
reconciled separately from native build and activation.
No main merge is authorized.

Scope: repair the two Windows process-detection failures, validate the existing
central Git/native-folder implementation, publish the task branch and deploy
the configured platform to Server20 through DevSetu. Retain pairing, roles,
credentials, runtime settings, monitoring history and persistent data. No
customer application deployment, database migration, new Git engine/service,
permission grant, repository migration or default-branch write is included.
Phase 4 remains open. See CENTRAL_GIT_COLLABORATION_HANDOFF.md for feature limits
and the complete implementation inventory.

The actual loopback fixture serves HTTP 200. CIM/netstat omit its listener,
while Windows IP Helper reports the exact PID. LocalDevProcesses.ps1 now uses
bounded native IPv4/IPv6 listener tables. Process/project ancestry, unique owner,
creation time and immediate pre-termination verification remain enforced.
The four unchanged local-development runtime tests PASS, including both formerly
failing workflows, owned process trees, foreign-process denial and PID identity.
No assertion, timeout, coverage threshold or acceptance source is weakened.

Observed local command: `node .local/Run-GitTarget.cjs test/local-development-runtime.test.ts`,
exit 0; 1 file / 4 tests.
The platform builder's root CI command now also prepares the pinned, verified
test Git engine, matching the existing GitHub workflow. A clean isolated source
build must run native Git acceptance rather than silently skip it for a missing
local test binary. This is test tooling only, not live engine installation.

## Validation

- `node .local/Run-GitCI.cjs` (the root `pnpm run ci` under the existing sanitized
  native build environment): exit 0. Repository/format/lint/type checks, all
  93 files / 472 tests, coverage, package build and high-severity audit pass.
  Contracts: 94; frontend: 104; backend: 274, with no skipped native Git test.
- Backend coverage: 95.01% statements, 91.39% branches, 96.73% functions,
  96.81% lines; unchanged thresholds. Frontend gated modules: 100%.
- The run started before insertion of the prepare:test-git CI entry; that exact
  entry was then executed separately with exit 0 and a verified cached binary.
  Runtime/test bodies were unchanged. Fresh configured builds execute the whole
  updated CI chain. No overlapping coverage writer is used.
- Native tests exercise actual Git/roles/PR/review, encrypted full backup and
  isolated restoration, pairing/DPAPI/system updates, Windows process lifecycle,
  protected files, unrelated listeners and failed-health recovery.
- Audit gate passes with 5 low / 8 moderate advisories; no high/critical or
  dependency version change. The existing frontend chunk-size warning remains.
- Bounded credential-format/private-key/protected-filename scan covers changed
  files and 567 unpublished blobs: PASS, zero findings. It is not exhaustive
  secret detection. The final publication head is checked again before push.
- Final head 88e6420 scan: 630 unpublished blobs, including long literal API
  credential checks, zero findings. `git push --set-upstream origin
  codex/central-git-collaboration` succeeds; remote readback is the exact full SHA.
- GitHub [CI run 41185857616](https://github.com/mishrarishav/FrevOS/actions/runs/41185857616)
  succeeds at 88e6420: clean install, governance/format/lint/types, pinned native
  Git test engine, tests/coverage, package build, non-Production image build,
  non-root runtime-image boundary and audit all pass. This separately establishes
  Linux/container CI; Windows-specific tests are established by the native run.
- `git diff --check`: exit 0. Documentation-only delivery edits are revalidated
  before publication. No default-branch push or automated merge is performed.

Server20 becomes reachable after the owner's VPN reconnection; health returns
HTTP 200 and authenticated SMB readback succeeds. Active manifest remains
4cd56dcc9583e9b15e300af116ed1bd35b3a6dc69ecb813afe25f4b9b3bafcd3,
application source d4967eca5272cc1360245e44336a738151b6e325. The previous e5b1122
preview request failed with android-build-deadline and is not active.

Fresh preservation baseline records eight pairing identities/credential hashes
and five stable runtime/project/pipeline configuration digests. Existing platform
source fc_a36e424f5355a31a00946ce3983ed064 is active on this laptop with its
Limited task running, still bound to the previous D: worktree. No re-enrollment,
source-folder reconfiguration, credential change, data write or release activation
has been performed in this continuation. The source folder must be selected
through the authenticated DevSetu workflow before publishing this checkout.

The one attempted saved-credential login is rejected with HTTP 401. It is not
retried, reset or used to bypass authentication. A visible DevSetu sign-in tab
is left for the owner; the password is not requested in chat.

The owner subsequently signs in. The authenticated UI verifies DevSetu Internal
and the existing owner-scoped source, builder and destination. Choose folder
rebinds the same fc_a36e424f5355a31a00946ce3983ed064 enrollment to this task
checkout, retaining its Limited running task and credential. The revisioned
pipeline changes only its default source folder (revision 3 to 4); the exact
revision-3 preimage is retained. Connection tests all pass. Eight pairings and
four other configuration files match the preservation baseline.

Preflight finds the existing Android SDK worker stopped after its historical
configuration-change failure. Its configuration and operator hashes still match
the enrolled identities. Scoped start as_79077143e9684ba7a6a28951cb1e3c11 restarts
only that installed restricted worker; fresh READY matches configuration
4c57e545113e019df054df5fb489307f2d6d05d51530894cfc269cf5f4f7ec41. No configuration,
signing identity, role or enrollment change is made.

The UI submits one Deploy all with the owner's dated ADR 0078 reference. DevSetu
publishes 4f1ea9f to its configured central repository and starts native build
cj_58ab24c11e25d160dc2f67484dce7fe2 in an isolated checkout. A VPN interruption
makes HTTP/SMB unavailable; the owner reconnects and health returns HTTP 200.
The same request is reconciled; no duplicate deployment is submitted.
GitHub CI 41186615284 also passes for the preceding docs-only 21d62da head.

The first native build fails in CI, before any artifact or destination job.
Its retained diagnostic records exit 3221226505 (0xC0000409), 21,641 output bytes.
A bounded reproduction identifies test-engine-download-failed followed by a
Node 24 Windows libuv closing-handle assertion. The fresh Windows test-engine
asset name incorrectly retains windows-4.0, which returns HTTP 404. The official
[28.2.0 inventory](https://dl.gitea.com/gitea/28.2.0/) publishes
gitea-28.2.0-windows-amd64.exe. Its vendor checksum matches the unchanged
d13471c433903d8c6c8b4cc7dd2783cff8b8ffb66d4698a76c2c0213ac378d53 pin.
The preparation script corrects that filename and cancels a rejected response
body before failing. A separate empty-cache download now verifies successfully;
no dependency version, test assertion, hash or threshold is relaxed.

The installed packaging sidecar also predates the new Git module inventory.
After the first job is terminal, the existing scoped idle-only updater passes
PlanOnly and Apply for pve_ad08a11ee79142cc960c96335aed2798. It retains exact
encrypted enrollment bytes, native adapter bytes, task definition and root
permissions; preimages remain in the executor's private update directory.
The reviewed packaging inventory is updated without altering the live release.

GitHub CI 41206764013 passes at 4f1ea9f. Fresh configured retry, frozen CI,
SDK/package/independent activation and final preservation remain pending;
no success is inferred from source publication or a prepared build.

The corrected-source run pr_ff167a14c33c9c7b645dd97cc698e5ff publishes b82e17e
and reaches native backend tests. Its CI exits 1 before packaging/activation.
Vitest's retained per-file result cache records 58 backend files passed and two
failed: preview-operators.test.ts and git-engine-native.test.ts. Both original
local-development process cases pass. The exact frozen checkout then passes
all seven cases in those two files using the sanitized native environment and
the same non-elevated Windows SID and Node binary. That targeted diagnostic uses
the JSON reporter without coverage; it does not replace the full coverage gate.
No source, assertion, timeout or dependency change is made. The original
failure messages were not retained, so their cause is not established and is not
attributed conclusively to host resource pressure.

GitHub CI 41208026140 passes at b82e17e. The owner-authorized fresh full retry
pr_bd4bd6a5a50a05ec0bb1ca293e55774b publishes 074b9e5 with the same tree and starts
native build cj_bfa4ee1f2244707bb3eddbeab52bf0a3. No artifact, destination job or
live activation is claimed yet. The native full CI must pass in this configured
run before activation. The UI's retained request retry reconciles an accepted
request after an HTTP response timeout without creating a duplicate deployment.

The negative missing-asset fixture remains fail-closed, but Node 24.19.0 on this
Windows host still reports its closing-handle assertion after the rejection,
even when the response body is cancelled. This is not represented as repaired.
The corrected official asset's positive empty-cache download passes with the
unchanged checksum and version. No general Node runtime upgrade is included.

## Final live receipt — 2026-10-31

DevSetu run pr_bd4bd6a5a50a05ec0bb1ca293e55774b succeeds. The configured source
publication, fresh isolated build and independent native destination are used;
there is no manual artifact activation substitute.

- Active source: 074b9e5b33770434142facfd0d9bb6dc54c081c7.
- Build job: cj_bfa4ee1f2244707bb3eddbeab52bf0a3.
- Destination job: cj_8ceb337d28087b1404ccd2312108293c.
- Component artifact reference: c5072536ecac8d6293a54d213124003c9485af97622d85cd4507b55efa2b5977.
- Active manifest: b0c300090e9423d4583dd5a386460b2bf5f1b9136bc6c8dd650331a7a3e5d24d.
- Archive: 131,931,814 bytes, SHA-256 0482509fd0be95e77c7170ff3f92bd9316f5673d51cf8b31fff91bd2a84974d8.
- Manifest inventory: 4,036 files. Source/digest/active-manifest readback matches.
- Fresh CI completes all stages; retained Vitest caches contain 15 contracts,
  18 frontend and 60 backend files, zero failed files, for the unchanged
  472-test suite. Backend coverage: 95.01% statements, 91.41% branches,
  96.73% functions, 96.81% lines; all original gates pass.
- SDK job ab_20848d9988d7145826f71159d68d6af5 returns SIGNED for this exact source
  and build correlation. APK: 33,177 bytes, SHA-256
  a0fb5f26d68feac2e6e966e1968717aec164c0030a8552728658bd1d25c6c8cf;
  retained certificate SHA-256 0d3a704822eacaef060a4560c2f800479179eed96dfbf9e94993dcf2b75cec92.
- Native Plan and Apply both PASS. Apply records health 200, UI 200,
  siblingsPreserved=true and databaseWritten=false. The authenticated reloaded
  UI shows succeeded, both executors online, eight protected paths and current
  build c5072536ecac. Independent HTTP checks repeat 200 for /health and /.
- Artifact/actor/workspace/target/correlation-bound approval is consumed once.
  Private runtime/task/IIS/active-state preimages remain at
  E:\FrevOS\operator\servix-dashboard-8ceb337d28087b1404ccd2312108293c.
  Its runtime preimage hash matches the original baseline; its active preimage
  matches the previous 4cd56d manifest. Saved-artifact code recovery remains
  available; no live rollback or database restoration is performed.
- Post-activation comparison preserves all eight pairing IDs, owners/scopes,
  statuses and credential hashes, and all four other stable configuration
  digests including runtime settings. Only the reviewed platform source-folder
  revision changes. Existing history remains visible, including 24 Servix dev
  records; no customer deployment or data migration is performed.
- Windows connector download has the current 14-file runtime manifest. Native
  picker, Connector.cjs and GitDesktop.cjs entry hashes verify; GitDesktop matches
  the activated release. Existing off-machine connectors are not silently
  replaced or re-enrolled. Native GUI proof remains the earlier local test.
- GitHub CI 41210424284 passes the exact activated source 074b9e5. Final handoff
  publication is a docs-only follow-up; the runtime source identity above is
  retained explicitly. No default-branch push or automated merge is performed.

Observed final commands: `node .local/Observe-Server20Release.cjs
pr_bd4bd6a5a50a05ec0bb1ca293e55774b`,
`node .local/Verify-Server20Preservation.cjs` and
`powershell.exe -NoProfile -ExecutionPolicy RemoteSigned -File
.local/Verify-Server20GitDownload.ps1`: exit 0 / PASS. The native updater's
result-plan.json and result-apply.json independently report PASS. Documentation,
diff and bounded secret checks are repeated before the follow-up push.

Limitations: no live private Git engine/service or permission/secret enrollment,
repository migration, customer deployment, SDK re-enrollment or automated merge
is performed. The two earlier native-file failures and the Windows rejected-fetch
assertion remain recorded rather than represented as resolved underlying causes.
Android phone pairing, Linux native UI and physical cross-laptop acceptance are
still unverified. This completes the authorized bounded release; it does not
declare Phase 4 or full GitHub/GitLab parity complete.

## Complete GitHub publication diff

The task branch includes 59 earlier pilot commits that are not on canonical
GitHub main yet. This full inventory is relative to main 5730940, rather than
only the current task base e5b1122. The current-task-only inventory remains in
CENTRAL_GIT_COLLABORATION_HANDOFF.md. No ignored runtime/credential artifact is
included. No main merge is performed.

216 files, +32412/-532.

- `.github/workflows/ci.yml` (+3/-0)
- `.gitignore` (+1/-0)
- `apps/android-connector/AndroidManifest.xml` (+15/-0)
- `apps/android-connector/src/org/devsetu/connector/ConnectorApi.java` (+80/-0)
- `apps/android-connector/src/org/devsetu/connector/LoginProofServer.java` (+78/-0)
- `apps/android-connector/src/org/devsetu/connector/MainActivity.java` (+173/-0)
- `apps/android-connector/src/org/devsetu/connector/MonitorService.java` (+104/-0)
- `apps/android-connector/src/org/devsetu/connector/PrivateState.java` (+51/-0)
- `apps/android-connector/src/org/devsetu/connector/ServerOrigin.java` (+44/-0)
- `apps/control-center/src/api.ts` (+231/-30)
- `apps/control-center/src/App.tsx` (+110/-6)
- `apps/control-center/src/ArtifactPromotionsPage.tsx` (+492/-0)
- `apps/control-center/src/connector-platform.ts` (+5/-0)
- `apps/control-center/src/DeploymentSettingsPage.tsx` (+63/-11)
- `apps/control-center/src/discovery-systems.ts` (+69/-9)
- `apps/control-center/src/DiscoveryPage.tsx` (+464/-306)
- `apps/control-center/src/FolderBrowser.tsx` (+7/-1)
- `apps/control-center/src/GitFoldersPanel.tsx` (+765/-0)
- `apps/control-center/src/HealthGraphs.tsx` (+14/-2)
- `apps/control-center/src/JoinRequestForm.tsx` (+303/-0)
- `apps/control-center/src/JoinRequestsInbox.tsx` (+246/-0)
- `apps/control-center/src/LocalDevelopmentPage.tsx` (+65/-3)
- `apps/control-center/src/RecordWorkspace.tsx` (+14/-4)
- `apps/control-center/src/RepositoryCenterPage.tsx` (+535/-0)
- `apps/control-center/src/RepositoryRecoveryDialog.tsx` (+121/-0)
- `apps/control-center/src/routing.ts` (+18/-0)
- `apps/control-center/src/styles.css` (+75/-0)
- `apps/control-center/src/SystemPairingDialog.tsx` (+45/-4)
- `apps/control-center/src/VpnPreviewButton.tsx` (+95/-0)
- `apps/control-center/test/app.test.tsx` (+7/-1)
- `apps/control-center/test/deployment-settings.test.tsx` (+36/-0)
- `apps/control-center/test/device-join-api.test.tsx` (+228/-0)
- `apps/control-center/test/discovery-systems.test.ts` (+59/-1)
- `apps/control-center/test/environment-seal.test.ts` (+9/-2)
- `apps/control-center/test/local-development-api.test.ts` (+33/-0)
- `apps/control-center/test/promotion-api.test.ts` (+62/-0)
- `apps/control-center/test/repository-center-api.test.ts` (+123/-0)
- `apps/control-center/vite.config.ts` (+3/-0)
- `apps/control-plane/src/artifact-promotions.ts` (+316/-0)
- `apps/control-plane/src/control-center.ts` (+27/-1)
- `apps/control-plane/src/developer-connectors.ts` (+69/-12)
- `apps/control-plane/src/device-logins.ts` (+266/-0)
- `apps/control-plane/src/discovery-access.ts` (+62/-0)
- `apps/control-plane/src/git-desktop.ts` (+775/-0)
- `apps/control-plane/src/git-engine.ts` (+207/-0)
- `apps/control-plane/src/join-requests.ts` (+501/-0)
- `apps/control-plane/src/local-development.ts` (+50/-0)
- `apps/control-plane/src/main.ts` (+120/-6)
- `apps/control-plane/src/preview-relay.ts` (+541/-0)
- `apps/control-plane/src/repositories.ts` (+56/-14)
- `apps/control-plane/src/repository-center.ts` (+828/-0)
- `apps/control-plane/src/server.ts` (+492/-2)
- `apps/control-plane/src/servix-deployment.ts` (+52/-6)
- `apps/control-plane/src/system-discovery.ts` (+65/-6)
- `apps/control-plane/test/accounts.integration.test.ts` (+94/-0)
- `apps/control-plane/test/android-build.test.ts` (+251/-0)
- `apps/control-plane/test/artifact-promotions.test.ts` (+681/-0)
- `apps/control-plane/test/component-executor.test.ts` (+55/-3)
- `apps/control-plane/test/control-center.test.ts` (+41/-0)
- `apps/control-plane/test/device-enrollment.test.ts` (+102/-12)
- `apps/control-plane/test/device-logins.test.ts` (+370/-0)
- `apps/control-plane/test/discovery-access.test.ts` (+134/-0)
- `apps/control-plane/test/fixtures/PromotionLifecycle.ps1` (+89/-0)
- `apps/control-plane/test/frontend-artifact.test.ts` (+149/-0)
- `apps/control-plane/test/git-desktop-runtime.test.ts` (+291/-0)
- `apps/control-plane/test/git-desktop.test.ts` (+473/-0)
- `apps/control-plane/test/git-engine-native.test.ts` (+27/-0)
- `apps/control-plane/test/git-recovery.test.ts` (+124/-0)
- `apps/control-plane/test/join-login.integration.test.ts` (+854/-0)
- `apps/control-plane/test/local-development-runtime.test.ts` (+26/-0)
- `apps/control-plane/test/local-development.test.ts` (+23/-0)
- `apps/control-plane/test/managed-runtime.test.ts` (+142/-0)
- `apps/control-plane/test/paired-login-clients.test.ts` (+103/-0)
- `apps/control-plane/test/postgres-service.integration.test.ts` (+342/-0)
- `apps/control-plane/test/preview-operators.test.ts` (+90/-0)
- `apps/control-plane/test/preview-relay.test.ts` (+947/-0)
- `apps/control-plane/test/promotion-environment.test.ts` (+183/-0)
- `apps/control-plane/test/promotion-files.test.ts` (+218/-0)
- `apps/control-plane/test/promotion-lifecycle.test.ts` (+297/-0)
- `apps/control-plane/test/repository-center.test.ts` (+627/-0)
- `apps/control-plane/test/servix-deployment.test.ts` (+37/-0)
- `apps/control-plane/test/servix-execution.test.ts` (+43/-1)
- `apps/control-plane/test/system-discovery.test.ts` (+219/-3)
- `apps/control-plane/test/system-enrollment-windows.test.ts` (+7/-1)
- `apps/control-plane/vitest.config.ts` (+3/-2)
- `deployment/android/AndroidBuild.cjs` (+486/-0)
- `deployment/android/AndroidBuildClient.cjs` (+147/-0)
- `deployment/android/AndroidBuilderService.cs` (+68/-0)
- `deployment/android/AndroidRuntimeSmoke.cjs` (+428/-0)
- `deployment/android/Enable-NativeExecutor.ps1` (+102/-0)
- `deployment/android/Enable-NativeExecutorRemote.py` (+129/-0)
- `deployment/android/Enroll-LambdaStub.ps1` (+33/-0)
- `deployment/android/Initialize-Sdk.ps1` (+80/-0)
- `deployment/android/Initialize-SigningIdentity.ps1` (+54/-0)
- `deployment/android/Install-AndroidBuilder.ps1` (+87/-0)
- `deployment/android/Install-RuntimeTools.ps1` (+47/-0)
- `deployment/android/Provision-SigningIdentity.ps1` (+45/-0)
- `deployment/android/Relocate-AndroidBuilder.ps1` (+31/-0)
- `deployment/android/Resolve-SigningReference.ps1` (+8/-0)
- `deployment/android/Run-AndroidBuilder.ps1` (+45/-0)
- `deployment/android/Run-RuntimeSmoke.ps1` (+37/-0)
- `deployment/android/Update-AndroidBuilderOperator.ps1` (+49/-0)
- `deployment/server20/Configure-PrivatePreview.ps1` (+83/-0)
- `deployment/server20/HttpCommon.ps1` (+13/-1)
- `deployment/server20/New-ServixDashboardRelease.ps1` (+39/-3)
- `deployment/server20/PreviewConfigurationRemote.py` (+139/-0)
- `deployment/server20/Test-AndroidCompatibility.ps1` (+47/-0)
- `deployment/server20/Test-PreviewExecutorUpdate.ps1` (+42/-0)
- `deployment/server20/Test-PrivatePreviewConfiguration.ps1` (+56/-0)
- `deployment/server20/Update-PreviewExecutor.ps1` (+71/-0)
- `deployment/server20/Validate-PreviewConfig.mjs` (+11/-0)
- `deployment/server20/Verify-AndroidCompatibility.ps1` (+37/-0)
- `deployment/servix/BatchLogon.psm1` (+51/-0)
- `deployment/servix/Build-DevRelease.cjs` (+26/-9)
- `deployment/servix/Build-Servix.ps1` (+23/-3)
- `deployment/servix/Connector.cjs` (+174/-2)
- `deployment/servix/DeviceEnrollment.cjs` (+68/-15)
- `deployment/servix/DeviceEnrollmentClient.js` (+6/-0)
- `deployment/servix/DiscoveryAccessPolicy.json` (+6/-0)
- `deployment/servix/FrontendArtifact.cjs` (+358/-0)
- `deployment/servix/GitDesktop.cjs` (+961/-0)
- `deployment/servix/GitRecovery.cjs` (+603/-0)
- `deployment/servix/GitService.ps1` (+40/-0)
- `deployment/servix/install.sh` (+5/-1)
- `deployment/servix/Invoke-DevRelease.ps1` (+12/-1)
- `deployment/servix/Invoke-PromotionTarget.ps1` (+230/-0)
- `deployment/servix/LocalDevelopment.cjs` (+59/-1)
- `deployment/servix/LocalDevProcesses.ps1` (+48/-2)
- `deployment/servix/ManagedRuntime.cjs` (+102/-0)
- `deployment/servix/ModelSecret.ps1` (+1/-1)
- `deployment/servix/NativePlatform.cjs` (+119/-2)
- `deployment/servix/New-ConnectorDownload.ps1` (+6/-4)
- `deployment/servix/New-LinuxDownload.mjs` (+10/-0)
- `deployment/servix/PairedLogin.psm1` (+26/-0)
- `deployment/servix/PreviewRelay.cjs` (+178/-0)
- `deployment/servix/PreviewRelay.example.json` (+18/-0)
- `deployment/servix/ProductionBackendRuntime.cjs` (+163/-0)
- `deployment/servix/PromotionBackup.cjs` (+263/-0)
- `deployment/servix/PromotionConnections.json` (+15/-0)
- `deployment/servix/PromotionFiles.cjs` (+359/-0)
- `deployment/servix/PromotionProtocol.mjs` (+217/-0)
- `deployment/servix/PromotionRegistry.json` (+44/-0)
- `deployment/servix/PromotionTools.json` (+10/-0)
- `deployment/servix/PromotionWorker.psm1` (+403/-0)
- `deployment/servix/Protect-PromotionBackup.ps1` (+53/-0)
- `deployment/servix/PublishedRelease.cjs` (+82/-0)
- `deployment/servix/Read-PromotionEnvironment.cjs` (+54/-0)
- `deployment/servix/ReleaseBuildProfile.json` (+50/-0)
- `deployment/servix/RepositoryPicker.cs` (+95/-0)
- `deployment/servix/Run-Activation.ps1` (+4/-2)
- `deployment/servix/Run-LocalDevService.ps1` (+1/-1)
- `deployment/servix/Run-PromotionHelper.ps1` (+20/-0)
- `deployment/servix/Run-SavedBackend.ps1` (+14/-0)
- `deployment/servix/Setup-Connector.ps1` (+7/-4)
- `deployment/servix/Setup-Executor.ps1` (+15/-3)
- `deployment/servix/Setup-Linux.cjs` (+10/-1)
- `deployment/servix/Setup-SystemLinux.cjs` (+30/-0)
- `deployment/servix/START-HERE.txt` (+21/-3)
- `deployment/servix/SystemEnrollment.cjs` (+8/-3)
- `deployment/servix/SystemLinuxInstaller.cjs` (+349/-0)
- `deployment/servix/Test-BundledRelease.cjs` (+26/-2)
- `deployment/servix/Test-GitRecoveryBoundary.ps1` (+32/-0)
- `deployment/servix/Test-PreviewConnectorUpdate.ps1` (+62/-0)
- `deployment/servix/Test-PromotionBackup.cjs` (+281/-0)
- `deployment/servix/Test-SystemConnectorUpdate.ps1` (+39/-0)
- `deployment/servix/Update-PreviewConnector.ps1` (+108/-0)
- `deployment/servix/Update-SystemConnector.ps1` (+27/-12)
- `docs/adr/0064-visible-production-configuration.md` (+53/-0)
- `docs/adr/0065-configured-saved-backend-production-promotion.md` (+63/-0)
- `docs/adr/0066-canonical-promotion-runtime-identity.md` (+39/-0)
- `docs/adr/0067-complete-application-release-promotion.md` (+66/-0)
- `docs/adr/0068-existing-development-source-acceptance.md` (+29/-0)
- `docs/adr/0069-audit-commit-development-acceptance.md` (+40/-0)
- `docs/adr/0070-discovery-role-and-owner-visibility.md` (+56/-0)
- `docs/adr/0071-device-bound-login-and-approved-join.md` (+89/-0)
- `docs/adr/0072-http-connector-confirmed-login.md` (+51/-0)
- `docs/adr/0073-discovery-legacy-grouping-and-last-seen.md` (+50/-0)
- `docs/adr/0074-android-system-monitoring-connector.md` (+94/-0)
- `docs/adr/0075-private-preview-request-response-relay.md` (+80/-0)
- `docs/adr/0076-configured-private-git-collaboration.md` (+92/-0)
- `docs/adr/0077-native-code-folder-selection.md` (+39/-0)
- `docs/adr/0078-native-listener-detection-and-server20-release.md` (+32/-0)
- `docs/adr/README.md` (+61/-0)
- `docs/ANDROID_CONNECTOR_HANDOFF.md` (+368/-0)
- `docs/ARCHITECTURE.md` (+27/-0)
- `docs/CENTRAL_GIT_COLLABORATION_HANDOFF.md` (+394/-0)
- `docs/CENTRAL_GIT_SERVER20_RELEASE_HANDOFF.md` (+448/-0)
- `docs/CURRENT_STATE.md` (+867/-1)
- `docs/DISCOVERY_PRESENCE_HANDOFF.md` (+90/-0)
- `docs/DISCOVERY_ROLE_ACCESS_HANDOFF.md` (+477/-0)
- `docs/PERMISSIONS.md` (+21/-0)
- `docs/PRODUCT.md` (+9/-1)
- `docs/ROADMAP.md` (+8/-0)
- `docs/SERVIX_APPLICATION_RELEASE_HANDOFF.md` (+939/-0)
- `docs/SERVIX_BACKEND_ARTIFACT_HANDOFF.md` (+6/-0)
- `docs/SERVIX_PRODUCTION_DEPLOYMENT_PLAN.md` (+209/-0)
- `docs/SERVIX_PRODUCTION_PROMOTION_HANDOFF.md` (+587/-0)
- `docs/SERVIX_PRODUCTION_READINESS.md` (+169/-0)
- `docs/VPN_PREVIEW_RELAY_HANDOFF.md` (+137/-0)
- `package.json` (+3/-2)
- `packages/contracts/src/artifact-promotions.ts` (+230/-0)
- `packages/contracts/src/developer-connectors.ts` (+5/-2)
- `packages/contracts/src/device-login.ts` (+29/-0)
- `packages/contracts/src/git-desktop.ts` (+203/-0)
- `packages/contracts/src/index.ts` (+6/-0)
- `packages/contracts/src/join-requests.ts` (+63/-0)
- `packages/contracts/src/local-development.ts` (+11/-0)
- `packages/contracts/src/preview-relay.ts` (+80/-0)
- `packages/contracts/src/repository-center.ts` (+248/-0)
- `packages/contracts/src/servix-deployment.ts` (+1/-0)
- `packages/contracts/src/system-discovery.ts` (+14/-1)
- `packages/contracts/test/preview-relay.test.ts` (+59/-0)
- `packages/contracts/test/repository-center.test.ts` (+230/-0)
- `packages/contracts/vitest.config.ts` (+2/-0)
- `scripts/prepare-private-git-test.mjs` (+57/-0)
- `scripts/test-private-git.cjs` (+760/-0)
