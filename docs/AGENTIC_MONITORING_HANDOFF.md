# Configurable agent and measured monitoring pilot

Status: local acceptance PASS; configured rollout and exact-download acceptance
remain pending. This is not yet a live acceptance claim.
Repository: FrevOS, branch `codex/agentic-monitoring-pilot`.
Base: `1f22ed2a6523678adcff35d8e8d1b9507ddce517`. No PR or merge.
Decisions: ADRs 0062/0063, the owner's supplied screenshots and explicit request.

## Scope and evidence rules

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
summary. It will be retried through the same configured source/build/deploy flow.

Native non-root Debian 12/Node v24.19.0 secret-boundary acceptance also passes in
an isolated read-only, network-disabled container: real Unix ownership/modes,
encrypted storage, wrong-actor denial, broad-mode denial and missing-master
fail-closed behavior. This is not Linux desktop/systemd installer acceptance.

Final `node .local/Run-CleanWindowsCI.cjs` (clean child `PSModulePath`, running
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
pass. No notification was sent to a real employee. Exact newly downloaded
sealed ZIP acceptance remains a separate post-rollout check.

`node .local/Scan-ActivitySecrets.cjs`, exit 0: the two owner-approved secret
values are absent from the complete diff and untracked publication inputs.
`git diff --check`, exit 0. The complete diff was reviewed before publication.
`node .local/Activity-ArtifactBaseline.cjs capture agentic-monitoring`, exit 0:
three profiles, two pipelines, eleven environment files and stopped local
services recorded; post-rollout verification is still required.

Targeted tests cover independent browser
sealing, native Windows DPAPI/ACL, gateway destination/authentication/response
policy, workspace/actor/device scope, revision/replay/expiry, inert drafts,
read-only plans, real filesystem metadata bounds, receipt-before-display and
real Fastify/PostgreSQL authentication/CSRF. Publication identities and complete
changed-file/diff inventory will be recorded after configured rollout.
