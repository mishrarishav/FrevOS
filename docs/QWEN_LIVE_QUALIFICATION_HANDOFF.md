# Qwen live qualification and Agents interaction

Date: 2026-11-01, Asia/Calcutta.
Owner follow-up: task-branch publication and Server20 release-build preparation
are now explicitly authorized. Activation remains excluded pending review of
the exact built artifact. The qualification snapshot below predates publication;
the appended delivery section records this new boundary separately.
Delivery status: PASS for publication; BLOCKED for release preparation pending
working local Docker. No exact new release artifact exists for activation review.
Status: BLOCKED for end-to-end live DevSetu/Paperclip use. Direct owner-provider
inference and the bounded local UI correction pass; these are separate results.
Repository: FrevOS. Branch: `codex/qwen-live-qualification`.
Base/current commit: `d1356d1b0ef95051c00330018ff474b28c2d6732`.
The implementation is uncommitted; no task PR, GitHub publication, merge or
Production UI activation is performed. Predecessor draft PR 41 stays unmerged.
Decision: [ADR 0079](adr/0079-qwen-live-qualification-and-agent-network-controls.md).
Phase 4 remains open.

## Live provider and saved configuration

The owner starts Qwen. Fresh inspection finds the existing gateway admission
marker enabled; no operator forces it on or bypasses the host watchdog.
Authenticated direct HTTPS completion returns 200, assistant text and usage;
missing authentication and the unsupported x-api-key scheme return 401.
The configured model file is `Qwen3.5-4B-Q4_K_M.gguf`, served as `hrms-local`.
Launcher configuration has 4096 context tokens, two CPU threads, zero GPU layers,
one parallel request and 256 default prediction tokens. The response proves the
alias, not an independent weights/version attestation.

Through the actual authenticated DevSetu Agents UI, all three existing agents
are saved at revision 2 with **256 maximum output tokens and a 60-second
timeout**. Their identity, parent relationship, model connection, evidence
source choices and notification opt-in remain as displayed; no credential is
entered/replaced, model policy expanded or employee notification sent. The
application keeps versioned skills and memory through its normal save action.
Provider limits and model weights are not increased. These are configured agent
values, not a Qwen-specific conditional or new global default.

The direct API probe and the control plane's own probe have different results:
the actual Server20 UI connection test still records **timeout**, so its agents
remain Needs connection. No ready state is forged and no readiness gate is
bypassed. Server20-origin diagnosis is retained separately; a successful laptop
request does not establish runtime egress from Server20.

The local follow-up adds a versioned `ModelTestInput` request with an optional
5-to-60-second budget. The model dialog selects it per connection; legacy empty
requests still use 15 seconds. It is a test option for the open page, separate
from saved agent run limits. The server audits the selected budget, retains
16-token probes and existing permission/CSRF/concurrency checks, and bounds the
response socket at 90 seconds. Stored connection/secret/test-result schemas do
not change, so this option needs no state migration or rollback rewrite.
This capability is locally tested, not yet active on Server20.

An additional credential-free Server20-origin diagnostic could not be launched:
native Task Scheduler registration reports unsupported account options/name,
and a read-only DCOM CIM session times out. No task Run call is reached, no
account/logon right is granted and no service/firewall policy is changed.
Reconciliation nevertheless finds six owned partial diagnostic task definitions
and removes all six after checking the exact nonce, action and non-running
state. Unrelated tasks are unchanged. The private reconciliation receipt is
`.local/qwen-egress-reconciliation.json`. This does not prove the cause of the
control plane's model timeout. A final actual UI test again reports timeout;
the model connection remains revision 1 and all agents remain Needs connection.

## Synthetic answer and latency checks

`node .local/QwenLiveQualification.cjs` exits 0. Six declared, small synthetic
checks pass: Hindi explanation, supplied project facts, unknown completion
without accepted milestones, exact JSON status, an untrusted-file instruction
attempt and multi-turn recall. Actual answers and timings are retained privately
in `.local/qwen-live-20261101-quality.json`.

| Case | Completion tokens | End-to-end latency |
| --- | ---: | ---: |
| Hindi explanation | 91 | 26.116 seconds |
| Hindi project evidence | 69 | 28.069 seconds |
| Unknown progress | 19 | 10.457 seconds |
| Structured status | 33 | 12.989 seconds |
| Untrusted file text | 21 | 11.795 seconds |
| Multi-turn recall | 7 | 7.948 seconds |

Median is 12.392 seconds. The proxy buffers each response; first response byte
is effectively the complete response, not time to first generated token.
These measurements are not isolated decoding throughput, concurrency/load
testing, a general intelligence score or a broad safety benchmark.

Manual review finds a limitation beyond the simple checks: the Hindi project
answer describes the supplied 20-percentage-point gap as "20% behind" and omits
the supplied OS-attribution caveat. Deterministic accepted milestone arithmetic
and provenance must remain authoritative under ADR 0062. File events cannot
prove completion or identify the human editor without matching audit evidence.

## Real Paperclip adapter qualification

Use official npm packages in a disposable Docker container, pinned to
`@paperclipai/adapter-opencode-local@2026.1023.0` and
`opencode-linux-x64@1.19.5`. Dependencies install with lifecycle scripts disabled;
the generated package lock retains package integrity values. The container has
no host mounts, a 768 MiB memory limit, one CPU, 128 PIDs, dropped capabilities
and no-new-privileges. The actual runner executes as UID 1000 with all tool
permissions denied and only synthetic context. The provider key enters through
private stdin and is redacted before any host result is persisted.

This tests the published adapter release, not every line of the earlier static
review at Paperclip commit `3ee4c5b6138da82d0b1f51aa010540561bf43c22`.

`node .local/Run-PaperclipQwen.cjs` completes the diagnostic (host exit 0), but
the **actual adapter/runner exits 1**: HTTP 400, unsupported field. The full PHP
URL followed by `/chat/completions` reaches the gateway, so this observed failure
is not a guessed URL-routing incompatibility.

The subsequent `--trace` run uses a trusted container-loopback relay that forwards
the request body unchanged to the real HTTPS gateway and injects the provider
credential only at that boundary. It records field names/counts, not credentials
or provider request headers. Both observed upstream requests return 400 and use
`model`, `max_tokens`, `messages`, `stream: true` and `stream_options`. There are
no tools in this tool-denied run. The existing gateway rejects `stream_options`
and streaming itself; its source also rejects tool schemas/tool-result history.
No fields are silently stripped and no synthetic SSE is presented as native
model streaming. Retained results are `.local/paperclip-qwen-live-20261101.json`
and `.local/paperclip-qwen-trace-20261101.json`.

This is an actual adapter/CLI invocation, not a full Paperclip company/task,
delegation, memory or scheduler acceptance run. No permanent Paperclip server
or production integration is installed. A versioned, scoped transport/agent
bridge and subsequent real orchestration acceptance are required before claiming
that complete workflow. The generic HTTP adapter is not a model chat client.

## UI correction and validation

Default Agents to cards and retain an explicit optional network view. Fit the
real node/label extents instead of a fixed oversized viewport, use a balanced
radial start for direct reports, constrain the SVG in the existing record body,
wrap toolbar controls and show explicit zoom percentage. Pointer panning uses
the SVG screen matrix, supports dragging from a node without opening its editor,
and ends on pointer cancellation/lost capture. A normal click, accessible
activation and keyboard Enter/Space retain configuration selection.

Actual CUA browser checks of the real component with synthetic agents observe:

- A 60 by 35 screen-pixel drag moves the node by 60 by 35 pixels, without selection.
- In a narrow portrait canvas, a 40 by 20 drag moves it by 40 by 20 pixels.
- Explicit zoom reaches 120% and remains there after refreshed observation objects.
- Reset returns to 100% and clears pan; a normal node click selects the agent.
- Keyboard Enter selects the same node; interactive descendants appear in accessibility.

The live Server20 page is put in its existing cards view as an immediate session
workaround. The corrected source has **not** been activated on Server20.

Observed source checks:

- `pnpm --filter @frevos/control-center typecheck`: exit 0.
- `pnpm --filter @frevos/control-center test` with the existing Windows
  PowerShell module path normalized for the child: 18 files / 104 tests pass.
  An inherited PowerShell 7 module path fails the unchanged native ACL fixture;
  the original test/ACL assertions are retained, not skipped or weakened.
- `pnpm --filter @frevos/control-center build`: exit 0; the existing large
  frontend chunk advisory remains.
- `pnpm run lint`: exit 0; pre-existing warnings remain.
- `pnpm exec biome format .`: exit 0.
- `pnpm run validate:repo`: exit 0 before this final evidence document; the final
  documentation check is recorded below.

The bounded model-test request/handler is the only backend behavior change.
No new runtime dependencies or persisted record fields are introduced. Full
platform release acceptance is not inferred from the frontend checks.

## Local test infrastructure recovery

The existing `frevos-local-caddy-1` proxy accumulates approximately 16,066 PIDs
and prevents Docker from starting a new isolated container (shim resource
unavailable). Its project/service/image identity is verified; a targeted restart
reduces it to 13 PIDs and restores test-container creation. The same local proxy
returns healthy; all four existing local application containers remain running.
No Docker reset, image replacement, volume removal, database write or Server20/
Server100 restart is used. The accumulation cause is not established or repaired
by that recovery and needs a separate bounded investigation.

The first full `pnpm run ci` passes contracts and frontend coverage but reports
a 77.7-second native Git engine fixture failure; its backend worker then stops
making progress and the owned CI run is interrupted. No full-suite pass is
inferred. Running the unchanged `node scripts/test-private-git.cjs` separately
passes real Git/PR/RBAC and full encrypted isolated recovery. The actual cause
of the earlier fixture/worker failure is not established. A separate targeted
backend run passes all 20 agent-workspace, model-gateway and Control Center
cases, including the new bounded test budget. The owned Vite preview is closed
after browser proof to release its memory before a fresh full CI retry. No
test, assertion, timeout, coverage gate or dependency is relaxed.

The fresh full `pnpm run ci > .local/qwen-full-ci-retry.log 2>&1` completes its
logged command chain: repository validation, formatting, lint, typecheck, pinned
native Git preparation, coverage, builds and high-severity dependency audit.
All 93 test files / **473 tests** pass: 94 contracts, 104 frontend and 275 backend.
Backend coverage is 95.04% statements, 91.43% branches, 96.73% functions and
96.83% lines; the original gates remain unchanged. The final build succeeds
with the existing frontend chunk-size advisory. The audit reports 5 low and
8 moderate advisories, with no high or critical findings. The detached shell's
final numeric exit line was not retained after context continuation; the
complete successful stage output is retained. A separate
`pnpm audit --audit-level=high` exits 0 and confirms the same counts. No full CI
pass is retroactively assigned to the interrupted first attempt.

The full workspace browser fixture also verifies that an out-of-range
61-second test budget disables Test connection and that 60 sends exactly
`{version: 1, timeoutSeconds: 60}`. The fixture's unavailable result is synthetic,
not provider inference. Temporary preview processes and the Paperclip container
are stopped/removed; the live user tab remains on cards. The graph screenshot
`.local/qwen-agents-network-full-preview.png` is a **local synthetic preview**.
The live limits and timeout screenshots are separate evidence.

## Changed files and next boundary

Complete tracked/untracked source change list:

- `apps/control-center/src/AgentNetwork.tsx`
- `apps/control-center/src/AgentsPage.tsx`
- `apps/control-center/src/api.ts`
- `apps/control-center/src/styles.css`
- `apps/control-center/test/agents-api.test.ts`
- `apps/control-plane/src/agent-workspace.ts`
- `apps/control-plane/src/server.ts`
- `apps/control-plane/test/agent-workspace.test.ts`
- `packages/contracts/src/agent-workspace.ts`
- `packages/contracts/test/agent-workspace.test.ts`
- `docs/CURRENT_STATE.md`
- `docs/AGENTIC_MONITORING_HANDOFF.md`
- `docs/QWEN_LIVE_QUALIFICATION_HANDOFF.md`
- `docs/adr/0079-qwen-live-qualification-and-agent-network-controls.md`
- `docs/adr/README.md`

Ignored `.local` files contain synthetic qualification tools/results and the
isolated fixture; no provider credential is committed or stored in reports.
Diff stat (publication review): 15 files changed, 546 insertions(+), 42 deletions(-).
The ten runtime/test files form a separately reviewed patch with SHA-256
`0134f192818bb7b570343be95cfdfc87d5f845e4752aeb735e9bd0c795658f2d`
(191 insertions, 42 deletions). This identifies a source patch, not a signed
platform artifact or commit. The complete 15-file review receipt is retained
privately as `.local/qwen-final-review.json`; the real Git index stays unchanged.
Final bounded secret checks compare the changed source and retained qualification
reports to the approved provider key without printing it, and check source for
private-key/token shapes. This is not a general repository security audit.
The final documentation validation is recorded in the same private receipt.
Next work is the unresolved Server20-origin provider check, a separately scoped
Paperclip protocol bridge if requested, and review/authorization of the UI
source publication and configured Server20 build/activation. Production release
still needs fresh actor/workspace/target/correlation/artifact-bound approval;
no previous release approval is reused.

## Approved publication and build preparation

On 2026-11-01 the owner authorizes publishing `codex/qwen-live-qualification`
and preparing the Server20 release through DevSetu. Existing pairings, data and
environment must be preserved. The approved runtime patch remains the ten-file
digest recorded above; only delivery documentation changes after full CI.
The prepared artifact must be presented with its exact source, archive and
manifest identities before a separate activation decision. No application stop,
destination activation, migration, credential change, permission grant, main
push or self-merge is authorized by this build-only request.

Fresh GitHub connector metadata verifies repository ID 1329122983,
`mishrarishav/FrevOS`, and task-branch push permission. The current Server20 root
is reachable, but its new browser session requires owner sign-in. No saved
password retry or authentication bypass is used.

Implementation commit `c4085150706b7ec4d5527c3e09143290713739b6` is published to
GitHub `codex/qwen-live-qualification`; `git push --set-upstream origin
codex/qwen-live-qualification` exits 0 and `git ls-remote` reads back the same
SHA. Draft [PR 42](https://github.com/mishrarishav/FrevOS/pull/42) targets main and
inherits unmerged PR 41. The bounded implementation is 15 files, +546/-42;
the canonical-main comparison at c408515 is 226 files, +32958/-574. No main push
or merge is performed. The complete bounded file list is above; preceding pilot
inventory remains in CENTRAL_GIT_SERVER20_RELEASE_HANDOFF.md.

[GitHub CI 41322553954](https://github.com/mishrarishav/FrevOS/actions/runs/41322553954)
passes c408515: governance, format, lint, types, pinned native Git, coverage,
build, non-Production runtime image/boundary and audit. Linux reports 94 contract,
104 frontend and 260 backend passes, with 15 Windows-specific cases skipped in
5 files. Do not present these as 473 unskipped Linux tests. The earlier complete
native Windows run separately establishes 473 passes. The same 5 low / 8 moderate
advisories remain. There are no new runtime source changes after c408515.

The owner signs in. Actual DevSetu Test connections reports passed for source,
builders and destination bindings. Source remains this checkout at pipeline
revision 4; the existing L-1770 source/builder and Server20 destination remain
online. No configuration save/re-enrollment or Deploy all is submitted.

Build-only limitation: the existing component API has deploy/rollback, not a
build-only operation, and would queue a destination job after a successful
build. To honor the owner's explicit pre-activation review, invoke only the
**already enrolled NativePlatform.build method** with the unchanged protected
builder configuration, pinned adapter, published source bundle and baseline.
This is separately recorded operator preparation, not a fabricated authenticated
control-plane pipeline request or an end-to-end configured deployment PASS.
It neither adds a shell tool to the product nor calls the adapter's activate
method. The existing SDK reference retains workspace/repository/signing scope.

Attempt correlation `cj_2623b1d9ad20db381d9bb2940a915164` freezes c408515, tree
`87ccf6bb8a6e485f82f514f370c293164a858040`. Its process is subsequently absent,
with no native-artifact descriptor, package receipt or completed CI evidence.
The cause of that process termination is not established and its numeric exit
was not retained. Do not count it as a successful build. Its private source,
plan and evidence are preserved. No SDK signing or destination activation is
inferred from a BUILDING progress record.

Retry prerequisite fails: local Docker Desktop is stopped, then startup shows
an Inference-manager `dockerInference` socket access error. After normal Quit,
verify only three zero-byte runtime endpoints in `Docker/run` and one in
`docker-secrets-engine`, then rename both stopped plain directories aside and
recreate the two runtime directories. Preserve the old endpoints; do not touch
VM disks, volumes or settings. Docker's fresh startup instead fails on the new
Secrets Engine `engine.sock` with the same Windows access-error class. The
[matching Docker issue](https://github.com/docker/desktop-feedback/issues/554)
is supporting upstream evidence, not proof of this host's kernel/root cause.
No reset, WSL unregister, security change, SDK replacement, skipped test or
weakened acceptance gate is used. A working Docker host/restart is requested.
The proposed temporary retry task has not been started; no new artifact exists.

The last successful fresh preservation receipt reports all eight pairing
identities/owners/scopes/statuses/credential hashes, all five stable configuration
files and active manifest
`b0c300090e9423d4583dd5a386460b2bf5f1b9136bc6c8dd650331a7a3e5d24d`
unchanged. The code path prepares only isolated source/baseline/output and the
enrolled immutable artifact store; no destination apply, application restart,
database migration/write, customer app change or environment edit is performed.
No new application health/rollback acceptance is claimed.

Delivery follow-up changes only CURRENT_STATE.md and this handoff (+82/-0).
The complete bounded delta is 15 files (+628/-42) relative to d1356d1.
