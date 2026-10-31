# Central Git Server20 release

Status: PASS for implementation, local CI and GitHub publication/CI.
Server20 deployment is BLOCKED at owner authentication. Owner-authorized
continuation under ADR 0078; downstream build/activation is not claimed.

Repository: mishrarishav/FrevOS (provider repository ID 1329122983).
Branch: codex/central-git-collaboration.
Implementation base: e5b1122ad95323b46beab3789672d2cb6ca2d9cd.
Canonical GitHub main: 5730940fe6c40cc3eb5002ef6beaa564c9571e5f, an ancestor.
Published implementation: 88e6420717898b6633bce86308053c3fa8b01314.
PR: https://github.com/mishrarishav/FrevOS/pull/41 (draft, unmerged).
Live deployment request: none submitted; no main merge is authorized.

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
is left for the owner; the password is not requested in chat. Once the owner
signs in, resume the authorized configured workflow: verify the current actor,
source/target and baseline, select this committed checkout using the existing
paired connector, submit one declared-approval deployment, observe fresh frozen
CI/SDK/package/independent activation, then compare health, active source/digest
and preservation evidence. New failures must be reconciled before any retry.

Native artifact/request identities, backup and post-activation preservation
evidence remain pending. Deployment success is not inferred from publication
or a prepared build. No review/merge, SDK re-enrollment, live Git service,
customer deployment or broad permission change is performed.

## Complete GitHub publication diff

The task branch includes 59 earlier pilot commits that are not on canonical
GitHub main yet. This full inventory is relative to main 5730940, rather than
only the current task base e5b1122. The current-task-only inventory remains in
CENTRAL_GIT_COLLABORATION_HANDOFF.md. No ignored runtime/credential artifact is
included. No main merge is performed.

216 files, +32239/-532.

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
- `docs/CENTRAL_GIT_COLLABORATION_HANDOFF.md` (+388/-0)
- `docs/CENTRAL_GIT_SERVER20_RELEASE_HANDOFF.md` (+323/-0)
- `docs/CURRENT_STATE.md` (+827/-1)
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
- `scripts/prepare-private-git-test.mjs` (+55/-0)
- `scripts/test-private-git.cjs` (+760/-0)
