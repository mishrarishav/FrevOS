# Android connector pilot handoff

Status: **IN PROGRESS; signing identity created and signed prototype verified; Android runtime and configured publication remain incomplete**.
Implementation and independent validation remain in progress; this is not a
completed release or a claim that an Android phone has connected.
Date: 2026-10-29, Asia/Calcutta.

Final current-source local CI is PASS: 83 files / 401 tests, including all coverage,
build and configured audit gates (five low/six moderate; no high/critical). The
clean native build environment is used; log .local/android-current-ci.log,
controller Run-AndroidCurrentCI.cjs exits 0. The complete 53-file source snapshot
finds no private-key material, provider-token pattern or private binary in the
changed source; this pattern check is not a comprehensive security audit.
The last software-renderer runtime at_4f301def1e7642058734b043982f3506 still fails
boot with code 0xC0000005, on observed Windows Server 2016 Standard / 10.0.14393.
SDK signing/build and engine-executable checks pass; native installation and
pairing remain unproven. The owner agrees to install/open the signed test APK on
an Android phone. Its verified copy is Downloads/DevSetu-Android-test-9c23e2f4.apk.
The configured platform pilot publication may proceed with that limitation
explicit in its change record; final Android acceptance and goal completion
remain pending rather than being inferred from source CI or SDK build success.

Native worker integration now PASSES on both enrolled executors: builder
ae_b066054879fe41f3883a72938f7ae72d and destination
ae_6c881a519f274475959f1ae9b4c13e3a. Existing credential values/protection scopes,
task definitions and root permissions are verified unchanged; encrypted before
states are retained. The destination transport removes its exact temporary task.
The first builder update fails at File.Replace's null backup argument; its old
cipher bytes and running task are confirmed restored. A real Windows fixture
reproduces ArgumentException for the null backup and passes an explicit retained
backup. The reviewed helper is corrected before the successful fresh action.
No application activation occurs during these enrollment operations.

Further runtime attempts remain FAIL: at_540026f8a17d432298820a77f27e9b91 exits
when the owned ADB daemon exits; at_ab61971c1e84461c8d13b228336dfc73 identifies
adb-bind-failed. The owned Windows/temp profile and documented localhost socket
then pass that stage, but at_7628439011e84b88bce8ec85f9d052f5 exits the emulator.
Engine diagnostic at_23448b67c1244d92b551569c2bb7096e proves the pinned QEMU
executable runs, but emulator boot exits with Windows code 3221225477 (0xC0000005).
No Android install/launch or native pairing pass is inferred. A targeted retry
replaces the deprecated indirect renderer with documented software SwiftShader;
no GPU driver, hypervisor, firewall or host security setting changes. See official
[graphics options](https://developer.android.com/studio/run/emulator-acceleration).

Latest execution: the owner logs in and explicitly approves creating/retaining the
new signing key in Server20's private boundary. Both former approval/session
blockers are resolved; do not ask again. Scoped one-use signing action
ak_95d2159442bd4f56be159b5660ace1c1 is PASS, with privateValuesDisclosed=false.
Public certificate SHA-256:
0d3a704822eacaef060a4560c2f800479179eed96dfbf9e94993dcf2b75cec92.
The SDK returns to its non-admin worker identity. A signed local-uncommitted
prototype ab_bf45fd821a6e85fb6e391c553276eae9 is 33,177 bytes, APK SHA-256
56859ecee2d61e9000da5eb1cfb0a1e35dae5bb26019c188c67fda17dded21d2,
configuration 4c57e545113e019df054df5fb489307f2d6d05d51530894cfc269cf5f4f7ec41,
same seven-file Java tree as below. It is not a committed-source release APK.

Official emulator/image copies complete. Initial extraction terminates because
the API 36 archive has data/empty_data_disk instead of userdata.img. Do not fake
that file or delete retained files. Correct the descriptor, restore the restricted
worker through scoped update au_d5538073fa914cbcacecf7da7adb8915, and verify every
retained file/length/hash against the official ZIPs, rejecting extras and links.
Runtime verification ar_1bb69d8cab12402ca0ae7fb0d4ba2d72 is PASS with seven tools,
root permissions preserved and the restricted worker restored. The revised
installer observes terminal child failures and restores its original worker
configuration/account in finally. No customer application or signing value is
changed by runtime verification.

The first actual signed runtime smoke at_28433695437646beb3b7eeff7d2b0856 fails
at emulator-boot with FATAL/emulator-exited; signed-artifact integrity passes.
Install, launch, update and native pairing are not established. Its worker is
restored with the exact configuration digest above. A reviewed runtime-only
operator update adds explicit enrolled sysdir/kernel/ramdisk/system paths and
fixed failure classifications. This is a targeted retry, not proof of the first
failure's precise cause. Use the official
[emulator image-path options](https://developer.android.com/studio/run/emulator-commandline)
and retain the failed evidence. No hypervisor, firewall, host protection, real
phone, existing ADB server or customer data is changed.

Resumed at 09:49 IST after the owner reports reconnecting. Server20 TCP 80/445,
HTTP health 200 and fresh non-admin SDK READY are observed. A fresh scoped SDK
operator update au_6e1d404400e942b5ac510c09f1d162c6 is APPLIED; the expired earlier
plan was not replayed. SDK/root permissions and installed toolchain files remain
preserved. Current Java source now compiles on Server20 with provenance checks:
job ab_7fe7170ef4a01286f0ce6b769fd425c0, tree
9c23e2f479beaaa6115494cc3952b63b051faa5112d050e338e3b47307759e12,
configuration 0a7a4c81a18cfb180bd2cbd269b14591a3c843e234e5649c6b38af17385275f2.
The unsigned prototype is 23,189 bytes, SHA-256
a1b19a52980784da8b51a5479de53266d11ce25a2a2e5d95ca0d43eed79f559f.
Its source remains local-uncommitted at the base below; it is not a published APK.
Official emulator/image copy is a live observed process, not a completed runtime
installation. The prior blocked audit below is historical; a resumed audit starts
fresh. The signing-key question has no observed answer. The actual DevSetu browser
opens at Authentication required; the owner is asked to log in without disclosing
a password. No key or release publication is inferred from VPN reconnection.

Repository: mishrarishav/FrevOS.
Worktree: D:\FREVOS\.local\worktrees\servix-dashboard.
Branch: codex/android-system-connector.
Base: 1d859f6e2c6b324bc73186f0516a1bb59a711b45.
Resulting commit / pull request: none yet. Changes remain local; no GitHub push
or default-branch merge. The preceding Discovery correction is separately LIVE
PASS, recorded in [its handoff](DISCOVERY_PRESENCE_HANDOFF.md).

## Authorized scope and boundaries

The owner explicitly accepts Android SDK terms and chooses Server20 for SDK and
APK builds. ADR [0074](adr/0074-android-system-monitoring-connector.md) bounds this
Phase 4 continuation. No personal-laptop Android SDK installation is required.
The current configured platform builder continues its existing Node/React CI;
only the enrolled Android compiler executes on Server20.

Implement an Android 8+ ARM64/x64 native connector, approved join-code or manually
approved pairing, OS/RAM/battery/app-volume health, authenticated Online and Last
seen, and a download beside Windows/Linux. No admin password, embedded server
address, project binding, personal files, remote commands or broad Android
permissions. CPU remains explicitly unavailable. Android may stop a foreground
service; do not promise uninterrupted background operation on every phone.

Retain existing Windows/Linux identities, owner/admin authorization, customer
applications, uploads, attachments, environment values and database contents.
Do not publish an unsigned/debug APK. The separate retained signing-key approval
required by AGENTS.md is now received and the scoped creation above is PASS.
Preserve that identity; never recreate or rotate it to retry a build.

## Server20 SDK evidence

The SDK/JDK archives are downloaded from official Google/Adoptium sources,
verified against official checksums and recorded with SHA-256. SDK 36, build tools
36, platform tools 37.0.1 and JDK 21 are installed at E:\DevSetuAndroid. A verified
same-volume relocation retained every SDK file and the original protected
control-plane parent permissions. Its receipt is results/sdk-relocation.json.

DevSetuAndroidBuilder runs as NT SERVICE\DevSetuAndroidBuilder, not Administrator.
Its sealed SDK/operator/private boundaries are read-only to the service; only
requests, jobs and results permit its writes. The main application parent ACL
is unchanged. Server20 SDK readiness and the non-admin process identity are
observed, not inferred from an installed service name.

Initial Java compilation exposed the missing official core-lambda-stubs.jar.
The bounded enrollment verifies it against the already approved build-tools ZIP:
SHA-256 2feb8df434cae3218ed9ffe9bae01ddec101d1dc5e12824c4209f61e283e0d3d.
No compiler gate, runtime permission or acceptance assertion is weakened.

An observed unsigned local prototype checkpoint compiled on Server20. The Java
client has advanced since this checkpoint; compile the current source again
after connectivity returns, rather than treating this older APK as the release:

- SDK job: ab_0e27fb530b8c7c46f6e2f5fb5713792d.
- Source state: local-uncommitted, base commit above; not a release commit.
- Seven-file source digest:
  3641ac46ad83ab62f8024fa46a41d2cd748f18b45310e9901da2d35920eb3589.
- APK: 22,144 bytes, SHA-256
  af4766721c690ebd246642116dd21f826b04e61cf7746037503506d8e378d9bd.
- Compiler configuration digest:
  49c5a67940e984da37773f186646e9a4fc720220a19f6ff3a10dcb792d1566dd.
- Manifest/package and the four allowed permissions pass compiled-APK checks.
- No retained signing identity, public Android download or runtime pairing is
  claimed from this unsigned result.

Operator-only evidence is retained under .local/android-prototype-result.json,
.local/android-toolchain-staged.json and the scoped SDK setup/update plans.
These files contain references/hashes, never private signing or pairing values.

## Observed validation

- PowerShell parser: all deployment/android scripts PASS, including the prepared
  signing provisioner. Parsing does not establish execution correctness.
- node --check AndroidBuild.cjs / AndroidBuildClient.cjs: PASS before formatting.
- pnpm run validate:repo: PASS, 113 Markdown documents before this handoff.
- pnpm run format:check: exit 0, 244 files before this handoff.
- pnpm run typecheck: exit 0 after correcting a new test's incorrect method name.
- Android build scope and Discovery tests: 14 tests in two files PASS; Android
  health/owner isolation, unsupported CPU/file controls and last seen are covered.
- The extended real PostgreSQL join/login integration test: PASS. A new Android
  user requires admin approval; platform/consent tampering is denied; ARM64 code
  redemption and fresh-heartbeat ordinary login challenge succeed. An earlier
  fixture omitted the heartbeat and correctly received 403; the fixture was fixed.
- UI join/discovery targeted suite: 13 tests in three files PASS.
- Android operator lint: exit 0, informational existing template-style notices.
  A new assignment-in-expression lint error was corrected before this result.
- Full pnpm run ci: exit 0, 83 files / 401 tests PASS (contracts 13/88, UI
  17/102, backend 53/211). Backend statement/branch/function/line coverage is
  95.03/91.49/96.70/96.56 percent; unchanged gates pass. Build passes with the
  existing UI chunk-size notice. Audit has five low and six moderate advisories;
  no high/critical advisories at the configured gate. Exact command sets the
  subprocess PSModulePath to Windows PowerShell 5.1 Modules, then pnpm run ci;
  report is .local/android-final-ci.log. An earlier inherited PowerShell 7 module
  path caused a fixture failure, not an application pass; that failure is retained.
- Subsequent first-observation UI wording: UI typecheck/build exit 0. Android Java
  lifecycle/recovery edits are not a new observed APK compile. The frozen-source
  native build must repeat all gates before publication.
- Actual native compatibility guard: five synthetic archive/source cases PASS,
  including compatible recovery and denial of a pre-Android downgrade before any
  activation. SDK client negative tests reject altered workspace/repository/job,
  configuration/source/tree/certificate or file bytes before exporting an artifact.
  These transport fixtures are explicitly not installable signed APKs.
- PowerShell 5 parser: all eleven deployment/android scripts PASS. The source-tree
  digest algorithm agrees between Node and PowerShell 5 for the seven source files.
- Local browser preview verifies the Android installer link, own-system view,
  RAM/battery/Last seen, explicit CPU unavailable and no desktop file controls.
  Screenshot .local/android-discovery-preview.png is sample data, not a phone.

## Current blockers and prepared continuation

Server20 TCP 80/445 both fail again at 2026-10-28T23:16:27Z. Earlier SMB archive writes
failed after the VPN path dropped. Native VPN UI recovery was attempted but
Windows returned locked-screen access denied. The user has a pending request to
unlock/reconnect; do not repeat SDK license consent or infer signing approval
from elapsed time. No new key has been generated.

Continuation verification: the final socket-cleanup edit is present. Windows
PowerShell 5.1 Parser.ParseFile passes all fifteen selected SDK/native scripts;
node --check passes AndroidBuild.cjs, AndroidBuildClient.cjs,
AndroidRuntimeSmoke.cjs and NativePlatform.cjs; pnpm run validate:repo passes
114 Markdown documents; git diff --check exits 0. The first parser harness in
this continuation incorrectly joined an already absolute path and failed to read
eleven files. Resolving each literal path fixes the harness; no product script
was changed to obtain the pass. These checks do not replace Server20 compilation
of the current Java client, signing or Android runtime testing. No new complete
CI run was necessary because no TypeScript/backend logic changed after the
recorded passing run. Network and signing-approval blockers remain unchanged.

Blocked audit: the same external blockers recur across three consecutive goal
turns. The preceding turn completed local syntax/repository verification; this
turn rechecks the actual Server20 ports and confirms both remain unreachable.
There is no confirmed live build/job handle to wait on and no further useful
independent release work. Mark the goal BLOCKED, retaining its full objective.
Resume after connectivity returns and the owner answers the pending signing-key
decision; never replay expired operator plans or infer approval from a resume.

The later SDK operator upgrade fails while reading its configuration, before
approval consumption, service stop, file replacement or permissions changes.
Plan .local/android-sdk-reviewed-operator-plan.json is now expired and must not
be replayed. The last observed SDK account remains its non-admin virtual service
account. Generate a fresh plan from the known installed before hashes in the
earlier successful entry/lambda plans and the current reviewed source hashes.

Pinned official emulator 37.2.12 and AOSP API 36 x64 r2 archives are verified as
transit downloads in .local/android-runtime-cache. No Android SDK is installed
on the personal laptop. Copy/extraction on Server20 is not verified. Checksums:
emulator SHA-256 3b524b6e0f1f5506d3d81af62ec9ce15b2a6f80f467e99574e167514ca181401;
image SHA-256 e1b9d9fb665001ef27b16e57d8762a2d54aec6bff617e17506edb8676667b9da.
Prepared runtime tools use only an owned headless emulator, dedicated loopback
ADB ports and a synthetic USB-device filter; no real phone or existing ADB server
is targeted. Hardware acceleration, firewall, battery protections and host security
are not weakened. Smoke testing needs sufficient server RAM/CPU/disk headroom.
It tests install/launch/same-APK update/owned stop, not native pairing or every OEM.

Prepared Android pairing recovery serializes Activity instances, retries an
approved redemption with the same saved credential, and can confirm a lost
successful response using that credential without needing a consumed code.
Reset rechecks that a connection did not complete meanwhile. A persisted
health-only epoch avoids filling event-cursor retention on service restarts.
These latest Java edits still require Server20 compile/runtime verification.

The SDK worker's current source also binds receipts to workspace, provider
repository, job/correlation, exact source tree, configuration and certificate;
the packager independently compares the authoritative SDK receipt. These new
operator files are prepared locally, not yet applied to the unreachable server.
The SDK deliberately retains at most 100 build job directories and fails closed
at capacity; reviewed archival/pruning is future operational work, not silent
deletion of history or private identity files.

## Remaining release work

1. Complete current Android runtime verification. The signed prototype and engine
   executable pass their checks, but emulator boot does not yet pass. Retain every
   failed receipt and report an actual infrastructure limitation if appropriate.
2. Review the complete tracked/untracked patch. Both native executor enrollments
   now pass; validate the final frozen source and full configured CI.
3. Package only a signed committed-source APK with its exact digest/certificate/
   source provenance, and validate the complete immutable platform release.
4. Publish/build/activate through actual DevSetu UI. Verify health, active source,
   approval bindings, existing installers and new APK download integrity. Preserve
   every customer runtime and persistent path. No source publication or activation
   is claimed from local tests or this handoff.
5. Verify compatible saved-bundle recovery and approved Android pairing/presence
   within the available runtime. Do not claim a physical phone test or guaranteed
   OEM background execution without that evidence.

Readiness: not release-ready; do not mark the Android goal complete.

## Changed files at this checkpoint

Complete path inventory below includes new files. The tracked-only Git diff stat is an interim checkpoint; new-file contents are not included until DevSetu publication stages them. No manual staging or commit was performed.

- apps/android-connector/AndroidManifest.xml
- apps/android-connector/src/org/devsetu/connector/ConnectorApi.java
- apps/android-connector/src/org/devsetu/connector/LoginProofServer.java
- apps/android-connector/src/org/devsetu/connector/MainActivity.java
- apps/android-connector/src/org/devsetu/connector/MonitorService.java
- apps/android-connector/src/org/devsetu/connector/PrivateState.java
- apps/android-connector/src/org/devsetu/connector/ServerOrigin.java
- apps/control-center/src/connector-platform.ts
- apps/control-center/src/DiscoveryPage.tsx
- apps/control-center/src/HealthGraphs.tsx
- apps/control-center/src/JoinRequestForm.tsx
- apps/control-center/src/JoinRequestsInbox.tsx
- apps/control-center/src/SystemPairingDialog.tsx
- apps/control-center/test/device-join-api.test.tsx
- apps/control-plane/src/developer-connectors.ts
- apps/control-plane/src/join-requests.ts
- apps/control-plane/src/server.ts
- apps/control-plane/src/system-discovery.ts
- apps/control-plane/test/android-build.test.ts
- apps/control-plane/test/join-login.integration.test.ts
- apps/control-plane/test/system-discovery.test.ts
- deployment/android/AndroidBuild.cjs
- deployment/android/AndroidBuildClient.cjs
- deployment/android/AndroidBuilderService.cs
- deployment/android/AndroidRuntimeSmoke.cjs
- deployment/android/Enroll-LambdaStub.ps1
- deployment/android/Enable-NativeExecutor.ps1
- deployment/android/Enable-NativeExecutorRemote.py
- deployment/android/Initialize-Sdk.ps1
- deployment/android/Initialize-SigningIdentity.ps1
- deployment/android/Install-AndroidBuilder.ps1
- deployment/android/Install-RuntimeTools.ps1
- deployment/android/Provision-SigningIdentity.ps1
- deployment/android/Relocate-AndroidBuilder.ps1
- deployment/android/Resolve-SigningReference.ps1
- deployment/android/Run-AndroidBuilder.ps1
- deployment/android/Run-RuntimeSmoke.ps1
- deployment/android/Update-AndroidBuilderOperator.ps1
- deployment/server20/HttpCommon.ps1
- deployment/server20/New-ServixDashboardRelease.ps1
- deployment/server20/Test-AndroidCompatibility.ps1
- deployment/server20/Verify-AndroidCompatibility.ps1
- deployment/servix/NativePlatform.cjs
- deployment/servix/New-ConnectorDownload.ps1
- deployment/servix/Setup-Executor.ps1
- docs/adr/0074-android-system-monitoring-connector.md
- docs/adr/README.md
- docs/ANDROID_CONNECTOR_HANDOFF.md
- docs/CURRENT_STATE.md
- docs/DISCOVERY_PRESENCE_HANDOFF.md
- packages/contracts/src/developer-connectors.ts
- packages/contracts/src/join-requests.ts
- packages/contracts/src/system-discovery.ts

Tracked diff snapshot before this inventory was appended:

```text
apps/control-center/src/DiscoveryPage.tsx          | 511 ++++++++++++---------
 apps/control-center/src/HealthGraphs.tsx           |  16 +-
 apps/control-center/src/JoinRequestForm.tsx        |  36 +-
 apps/control-center/src/JoinRequestsInbox.tsx      |   7 +-
 apps/control-center/src/SystemPairingDialog.tsx    |   3 +-
 apps/control-center/test/device-join-api.test.tsx  |   2 +-
 apps/control-plane/src/developer-connectors.ts     |   5 +
 apps/control-plane/src/join-requests.ts            |   7 +
 apps/control-plane/src/server.ts                   |  14 +
 apps/control-plane/src/system-discovery.ts         |  20 +
 .../test/join-login.integration.test.ts            |  80 ++++
 apps/control-plane/test/system-discovery.test.ts   |  92 +++-
 deployment/server20/HttpCommon.ps1                 |   1 +
 deployment/server20/New-ServixDashboardRelease.ps1 |  32 +-
 deployment/servix/NativePlatform.cjs               |  55 +++
 deployment/servix/New-ConnectorDownload.ps1        |   2 +
 deployment/servix/Setup-Executor.ps1               |  13 +-
 docs/CURRENT_STATE.md                              |  31 +-
 docs/DISCOVERY_PRESENCE_HANDOFF.md                 |  22 +-
 docs/adr/README.md                                 |   4 +
 packages/contracts/src/developer-connectors.ts     |   5 +-
 packages/contracts/src/join-requests.ts            |   6 +-
 packages/contracts/src/system-discovery.ts         |   4 +-
 23 files changed, 710 insertions(+), 258 deletions(-)
```
