# Configurable agent and measured monitoring pilot

Status: PASS for the bounded application pilot, configured live rollout and
exact-download native acceptance. Owner-provider inference remains unavailable
(live test: timeout); this is not an end-to-end working AI-answer claim.
Repository: FrevOS, branch `codex/agentic-monitoring-pilot`.
Base: `1f22ed2a6523678adcff35d8e8d1b9507ddce517`. No PR or merge.
Decisions: ADRs 0062/0063, the owner's supplied screenshots and explicit request.

## Final live delivery, 2026-10-26

The actual DevSetu source publication/build/independent SYSTEM activation flow
completed request `pr_d7190750e13d561d08f064bcd08c4ba0` at source
`7acce2d8df5a2da02462e27a3f9e05f3fab4d06d`. No manual Git publication or
customer application deployment substituted for this flow. Final identities:

- Active manifest SHA256:
  `d8a4047960c9d9a62f31ffb640fd77fb0900f16470f9e1ee7d279a6752b8832f`.
- Sealed archive SHA256:
  `fef6ddfe809eed2778f554c0ccc7b59ec38ec1e3e537bfbe57c7c9db19626558`
  (131,554,806 bytes).
- Actual Windows ZIP SHA256:
  `899f43fbf6c189311ca64c67ccb082156c0f1ecb04f0c52d339584397ebd45b9`
  (39,006,564 bytes).
- Native activation receipt: HTTP health 200, UI 200, sibling applications
  preserved, databaseWritten false, private rollback backups retained.

`node .local/Agentic-FinalAcceptance.cjs`, exit 0, verifies the downloaded ZIP
against the live manifest and the exact sealed server package. Its subcommands
and observed outcomes are:

- `node .local/Agentic-Unicode-Download.cjs`: exit 0, actual downloaded ZIP hash
  and runtime-manifest integrity pass.
- `node .local/Agentic-component-native-receipts.cjs native-agentic-unicode`:
  exit 0, independent activation receipt and health/UI results pass.
- `node .local/component-copy-native-release.cjs native-agentic-unicode` and
  `node deployment/server20/Verify-HttpManifest.mjs <sealed-package> <manifest>`:
  exit 0, local sealed bytes match the activated manifest. Full manifest output
  stays in the private local receipt, not in this report.
- `<downloaded-node.exe> .local/Test-AgenticFinalDownloaded.cjs <download>`:
  exit 0, real PostgreSQL/Fastify, separate installer and owner browser contexts,
  one owner login/proposal/approval/device, native ACL/DPAPI/Limited task,
  setup-close survival, passwordless same-device update, unchanged credentials,
  local notification opt-in, bounded consent backup, actual typed D: folder
  search and interrupted-runtime recovery pass. Three viewports, zero page
  errors. Synthetic fixture cleanup completes; no customer data is used.
- `<downloaded-node.exe> .local/Test-DownloadedNotificationUnicode.cjs <download>`:
  exit 0, actual Windows PowerShell preserves Hindi through the exact downloaded
  collector's input boundary. No popup is constructed or displayed.
- `node .local/Configure-AgenticFinalLive.cjs`: exit 0, actual live UI and three
  viewports pass with zero page errors; the protected model connection and three
  editable owner-configured agents survive activation unchanged. Test connection
  returns a valid HTTP response with truthful `timeout` status, not HTTP 502.
- `node .local/Test-AgenticLiveMonitoring.cjs`: exit 0, twelve actual received
  L-1770 samples, measured graph points, separate noise segment and responsive
  header controls pass at three viewports with zero page errors.
- `node .local/Activity-ArtifactBaseline.cjs verify agentic-monitoring`: exit 0,
  three profiles, two pipelines, eleven environment files and stopped local
  customer services match the captured baseline.

Final aggregate receipt: `.local/agentic-final-acceptance.json`; individual
logs/results use `.local/agentic-final-*`. Final clean Windows CI
`node .local/Run-CleanWindowsCI.cjs` (running `pnpm run ci`), exit 0, passes
341 tests: 88 contracts, 91 UI, 162 control plane; repository/format/lint,
typecheck, coverage, builds and the high audit gate pass. Control-plane
statement/branch/line coverage: 95.05%/91.45%/96.49%; UI covered surfaces remain
100%. Log: `.local/agentic-unicode-ci.log`. Existing audit findings are five
low/six moderate, no high; the 586.00 kB UI chunk advisory remains. No coverage
gate was lowered or external acceptance implementation changed.

Use the existing live DevSetu browser session: refresh, open Discovery for
health/activity and Agents for Model connections, editable agent configuration,
Ask agent, run history and approved laptop notifications. The three configured
roles are editable data, not fixed product identities. The model identifier is
unconfirmed because the owner endpoint is unavailable. No actual employee
notifications or autonomous personnel actions were performed.

An older laptop needs the final Windows ZIP extracted and `Setup.cmd` run once
on that laptop for new collector capabilities. The tested same-device update
preserves pairing and credentials and does not require another administrator
account password or uninstall. This session did not remotely update L-1465.
Server-side graphs/Agents require a browser refresh only. Linux secret storage
passed native non-root Debian container acceptance; Linux desktop installation,
notifications, other laptops and successful owner-provider inference remain
unverified. Customer Production activation is excluded. This pilot is ready for
owner use of monitoring/configuration and a fresh model test after provider
recovery; full roadmap phases and autonomous orchestration are not complete.

Delivery-result edits to this handoff and `docs/CURRENT_STATE.md` are recorded
after activation; they are not represented as bytes in the sealed artifact.
The owner subsequently authorized publishing the current dedicated branch to
the existing GitHub origin. That publication includes the preceding configured
DevSetu source history and a separate documentation-result commit. It does not
activate another release, change the central deployment source, create a pull
request or merge the default branch.
Final documentation checks: `pnpm run validate:repo`, exit 0 (96 Markdown
files); `git diff --check`, exit 0; `node .local/Scan-ActivitySecrets.cjs`,
exit 0 (owner secrets absent from the complete diff and untracked inputs).
The final documentation diff was reviewed. Working checkout:
`D:\FREVOS\.local\worktrees\servix-dashboard`.

## Scope and evidence rules

### GitHub integration follow-up

The owner requested integration into GitHub `main`. Draft PR
[#38](https://github.com/mishrarishav/FrevOS/pull/38) targets `main` and includes
the preceding configured deployment history. Initial GitHub Actions run
`40275026284` failed its actual Linux Git publication test with `spawn git
ENOENT`: the fixed Servix compatibility execution environment used its Windows
PATH on every platform. The scoped follow-up uses `/usr/bin:/bin` on POSIX and
retains the established Windows compatibility PATH. The service environment is
still allowlisted; arbitrary PATH, database/transport secrets and NODE_OPTIONS
remain excluded. The existing real Git bundle/import/preservation test remains
enabled, and the environment regression also checks the executable-path boundary.
No threshold is weakened and no failure is bypassed. This follow-up is not
deployed by opening or merging the PR; the activated source/digest above remains
the live acceptance identity. Final PR checks are a separate merge gate. The
automated author must leave mark-ready and squash merge to the human owner per
`docs/MERGE_POLICY.md`.
Targeted command `pnpm --filter @frevos/control-plane exec vitest run
test/servix-execution.test.ts test/connector-local-git.test.ts`, exit 0: both
tests pass on Windows, including actual bundle publication/preservation.
The complete Windows regression log is `.local/github-pr38-windows-ci.log`;
GitHub's separate Linux test/image/audit result must pass on the final PR head.
The follow-up changes only `apps/control-plane/src/servix-deployment.ts`,
`apps/control-plane/test/servix-execution.test.ts`, this handoff and
`docs/CURRENT_STATE.md`. Its validation status is tracked on PR #38.

CPU/RAM graphs contain received whole-machine samples only, bounded to 180
points/15 minutes. Missing samples and offline periods are gaps. They are not
project productivity scores.

Connections configure endpoint/model/authentication/data policy. Credentials
cross the browser boundary in a context-bound X25519/HKDF/AES-GCM envelope;
server persistence uses CurrentUser DPAPI/private ACL on Windows or an
owner-private AES-GCM key on Linux. Only opaque references reach APIs/audits.
HTTPS destinations must resolve entirely to public addresses, pinned for the
request; redirects, private/metadata targets, tool calls and oversized responses
are denied. Provider inference is read-only and bounded. Tiny synthetic
connection tests do not send workspace evidence.

Every agent has editable identity, model connection, parent relationship,
versioned `skills.md` and `memory.md`, evidence-source choices, output/time
limits and a notification-draft guardrail. Network links show configured
relationships; highlights show actual requested runs, not invented activity.
Agents do not independently delegate, execute commands or modify their memory.

Verified delivery plans determine assigned responsibility, accepted weighted
completion, planned completion and schedule variance. Device/source bindings
are verified separately. Requested folder-name metadata searches are at most
two devices, 1000 directories, 1000 queued directories, two seconds and forty
matches per device. A name match is an unverified candidate. Missing or partial
results cannot establish absence, authorship or delivery completion. File
contents require the preceding separate exact-file/local-approval flow; these
agent requests do not grant content access.

Notifications remain drafts until the authenticated human approves the exact
message/device/digest/revision. The device independently requires local opt-in
for the pairing account and consumes a durable receipt before requesting an OS
display. Approvals expire after ten minutes; no replay/retry on uncertainty,
one approval per device per hour and seven-day bounded records. Display requested
does not mean seen/read. No real employee messages are authorized as tests.

## Preservation and limits

No customer application, uploads, attachments, environments, runtime services or
Production activation are in scope. The platform must use its configured source
publication/build/independent updater path, preserving the same immutable bundle.
An updated local collector requires the newly downloaded package and explicit
same-device local setup; server/UI rollout cannot silently upgrade another
laptop. Existing credentials/device identity remain protected by the preceding
tested updater. Linux desktop notifications and an actual other laptop are not
claimed verified by Windows or container tests.

The owner-provided model endpoint's primary authenticated synthetic probe
currently returns HTTP 503 `unavailable`. Bearer authentication is accepted at
the gateway, but inference success/model identity is not established. Secrets
are resolved privately from the explicit owner instruction, never copied here.

## Validation record

The first successful feature rollout `pr_fd726ef64e3fef0958cb0d4e5df96041` at source
`6a4369386852a066b01eeea05776b04a18516a5b` was activated with manifest
`d2526464a09afe90aca112adbaf9004f48190cbce600ca800e6b060acdb141f5`.
Its native SYSTEM receipt confirms HTTP/UI 200, siblings preserved and no
database write. Sealed archive SHA256 is
`6ff615a0238f5f16e616b46f82f88a2feb603017214d63c15247678235ad5f38`
(131,556,006 bytes). The actual 39,006,537-byte Windows download matches sealed
SHA256 `7879157f23c7134fb8663f4503c0274df64be9bfedb6da94fba154e530f78456`.
Post-rollout customer baseline verification passes. The model connection is
saved behind its protected reference and three editable agents are configured
as owner data, not product defaults. No real notification was delivered.

The exact downloaded ZIP's own Node v24.19.0 passes actual Windows/native
acceptance against the same sealed server/UI bytes (local package first
verified against the live manifest, avoiding slow UNC module loading). The
test uses real PostgreSQL/Fastify, separate installer/owner browsers, native
ACL/DPAPI/Limited tasks, one login/proposal/approval/device, preserved credentials,
fresh health, same-device update, local notification opt-in, bounded previous
consent replacement and interrupted-runtime recovery. A real typed HTTP folder
request is claimed and completed by that installed collector: it finds the
new synthetic project folder on D: using at most 1000 directories/two seconds,
without file contents. Three viewports and zero page errors pass. Synthetic
fixture files/tasks/containers are cleaned independently of customer data.
Receipt: `.local/agentic-downloaded-windows-result.json`.

Live model testing exposed an integration mismatch: the normal HTTP idle socket
limit is ten seconds, while the bounded provider test may take longer. The
server persisted a timeout result but the browser received HTTP 502. A bounded
follow-up extends only the already authenticated/CSRF-checked model-test reply
socket to forty seconds, retaining its existing protected-key/DNS/inference and
concurrency bounds. The ordinary server limits remain unchanged. A real TCP
Fastify/PostgreSQL test with an eleven-second synthetic provider response passes
HTTP 200 and the strict model-result contract; this test would lose the socket
without the fix. It is not a claim of owner-provider availability.

A final Windows notification compatibility check found that default PowerShell
stdin decoding corrupted Hindi text. The static notification boundary now sets
UTF-8 input explicitly, matching the other protected local helpers. A native
PowerShell test executes the actual validation/input prefix and compares the
decoded Hindi message through an ASCII-safe result, without constructing a
NotifyIcon or displaying any popup. It fails against the preceding prefix and
passes with the fix. No message or command text is interpolated into executable
PowerShell; text still arrives only over private stdin. The final client ZIP
must contain this corrected collector; a server-only update cannot change an
already installed older collector.

The first configured request `pr_c783a5aa64db4ce59b0800487729b596` published
source `5caeaf504e4a9b92ae4ef4af1f4cb3bd5429a36b` but was deliberately stopped
before any activation after inspecting the existing executor's older enrolled
operator. Its fixed copy list omitted the new agent modules. The exact owned
builder PID/parent/job/source and still-active preceding manifest were checked
before stopping only that builder and its inherited Linux-download child. The
pipeline records a failed build; it is not presented as a successful rollout.
The existing platform remained active. Two enrolled operator scripts were
updated from the exact frozen approved source with atomic backup/hash checks;
credential bytes and task configuration were preserved. No other process or
customer service was stopped. Receipt: `.local/agentic-native-operator-update.json`.

A follow-up adds a deterministic packaged relative-module closure check before
sealing, so a missing transitive application/contract module cannot become an
activation candidate. `powershell.exe -NoProfile -NonInteractive -ExecutionPolicy
Bypass -File .local/Test-AgenticModuleClosure.ps1`, exit 0: actual operator guard
accepts a valid graph and rejects missing and escaped modules. The follow-up
also constrains the agent flex item: at 390px its measured width becomes 366px
instead of a clipped 499px. Actual built-UI browser flow passes again; all
header controls remain reachable, with internal scrolling for the network and
summary. The subsequent configured retries succeeded as recorded above.

Native non-root Debian 12/Node v24.19.0 secret-boundary acceptance also passes in
an isolated read-only, network-disabled container: real Unix ownership/modes,
encrypted storage, wrong-actor denial, broad-mode denial and missing-master
fail-closed behavior. This is not Linux desktop/systemd installer acceptance.

Preceding `node .local/Run-CleanWindowsCI.cjs` (clean child `PSModulePath`, running
`pnpm run ci`), exit 0, log `.local/agentic-ci-final.log`: repository/format/lint,
typecheck, 340 tests (88 contracts, 91 UI, 161 control plane), coverage, builds
and high audit gate pass. Control-plane statement/branch/line coverage is
95.07%/91.51%/96.48%; UI API/experience/routing coverage remains 100%.
Existing audit findings remain five low/six moderate, with no high finding.
The existing large UI chunk advisory remains (586.00 kB minified). No threshold
was lowered and no acceptance implementation was changed to make checks pass.

`node .local/Test-AgenticBrowser.cjs` passes real isolated PostgreSQL/Fastify
authentication, actual protected Windows credential persistence, actual built
React UI review/sealing/commit/test, three agents, editable skills/memory,
network selection, deterministic plan facts, inert notification draft, provider
unavailable state, 1440/768/390px viewports and measured graph fixtures, with
zero page errors. Inference is an explicitly synthetic conformance adapter,
not an assertion that the owner provider is available. The test exposed and
fixed SVG pointer capture intercepting agent selection and unstable native
select/textarea accessible labels. Final viewport verification also fits the
network inside its bounded internal scroller.

`node .local/Test-AgenticWindows.cjs <candidate-package>`, exit 0, log
`.local/agentic-windows-preflight-final.log`: real native ACL/DPAPI/Limited task,
one owner login/proposal/approval/device, same-device update without another
account password, preserved credentials, local notification opt-in and bounded
previous-consent replacement, continued health and interrupted-runtime recovery
pass. No notification was sent to a real employee. The separate exact downloaded
sealed ZIP acceptance subsequently passed as recorded above.

`node .local/Scan-ActivitySecrets.cjs`, exit 0: the two owner-approved secret
values are absent from the complete diff and untracked publication inputs.
`git diff --check`, exit 0. The complete diff was reviewed before publication.
`node .local/Activity-ArtifactBaseline.cjs capture agentic-monitoring`, exit 0:
three profiles, two pipelines, eleven environment files and stopped local
services recorded; final post-rollout verification passed as recorded above.

Targeted tests cover independent browser
sealing, native Windows DPAPI/ACL, gateway destination/authentication/response
policy, workspace/actor/device scope, revision/replay/expiry, inert drafts,
read-only plans, real filesystem metadata bounds, receipt-before-display and
real Fastify/PostgreSQL authentication/CSRF. Final publication identities and
the complete changed-file/diff inventory are recorded in this handoff.

## Complete published source inventory

Base `1f22ed2a6523678adcff35d8e8d1b9507ddce517` to resulting source `7acce2d8df5a2da02462e27a3f9e05f3fab4d06d`: 49 files changed, 7291 insertions(+), 62 deletions(-).
No PR or merge; the configured DevSetu source publisher created these commits.
Final runtime receipts and these delivery-result documentation updates are
recorded separately after activation.

- `apps/control-center/src/AgentNetwork.tsx`
- `apps/control-center/src/AgentNotificationsPanel.tsx`
- `apps/control-center/src/AgentsPage.tsx`
- `apps/control-center/src/App.tsx`
- `apps/control-center/src/DiscoveryPage.tsx`
- `apps/control-center/src/HealthGraphs.tsx`
- `apps/control-center/src/RecordWorkspace.tsx`
- `apps/control-center/src/api.ts`
- `apps/control-center/src/model-seal.ts`
- `apps/control-center/src/styles.css`
- `apps/control-center/test/agents-api.test.ts`
- `apps/control-center/test/health-graphs.test.tsx`
- `apps/control-center/test/model-seal.test.ts`
- `apps/control-plane/src/agent-notifications.ts`
- `apps/control-plane/src/agent-workspace.ts`
- `apps/control-plane/src/main.ts`
- `apps/control-plane/src/model-gateway.ts`
- `apps/control-plane/src/model-secrets.ts`
- `apps/control-plane/src/project-folder-search.ts`
- `apps/control-plane/src/server.ts`
- `apps/control-plane/src/system-discovery.ts`
- `apps/control-plane/test/accounts.integration.test.ts`
- `apps/control-plane/test/agent-notifications.test.ts`
- `apps/control-plane/test/agent-workspace.test.ts`
- `apps/control-plane/test/fixtures/model-seal.ts`
- `apps/control-plane/test/model-gateway.test.ts`
- `apps/control-plane/test/model-secrets.test.ts`
- `apps/control-plane/test/notification-runtime.test.ts`
- `apps/control-plane/test/project-folder-search.test.ts`
- `apps/control-plane/test/system-discovery.test.ts`
- `apps/control-plane/test/system-folders-runtime.test.ts`
- `deployment/server20/HttpCommon.ps1`
- `deployment/server20/New-ServixDashboardRelease.ps1`
- `deployment/servix/DeviceEnrollment.cjs`
- `deployment/servix/DeviceEnrollmentClient.js`
- `deployment/servix/FolderBrowse.cjs`
- `deployment/servix/ModelSecret.ps1`
- `deployment/servix/New-ConnectorDownload.ps1`
- `deployment/servix/Notification-Consent.ps1`
- `deployment/servix/SystemDiscovery.cjs`
- `docs/ACTIVITY_MONITORING_HANDOFF.md`
- `docs/AGENTIC_MONITORING_HANDOFF.md`
- `docs/CURRENT_STATE.md`
- `docs/adr/0062-configurable-agent-monitoring-pilot.md`
- `docs/adr/0063-requested-project-folder-discovery.md`
- `packages/contracts/src/agent-workspace.ts`
- `packages/contracts/src/index.ts`
- `packages/contracts/src/system-discovery.ts`
- `packages/contracts/test/agent-workspace.test.ts`
