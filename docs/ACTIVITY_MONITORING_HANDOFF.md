# Bounded activity and requested file snapshots

## Scope and source

Status: implementation, full local/frozen CI, native replay and configured live
publication PASS. Repository `D:\FREVOS`, worktree
`.local/worktrees/servix-dashboard`, branch `codex/discovery-activity-noise`.
Base `1d79cc26fd41ebf178e1ade8a76f1f595cd15997`. No PR or merge. ADRs 0060/0061
record the owner's 2026-10-26 approval. Preserve the preceding Current State
and passwordless handoff result edits. This remains the bounded Phase 4 pilot.

Work / other, Temp / Cache / Tooling and All views use configurable folder
rules, summary intervals, separate byte/event reservations and shorter noise
retention. Defaults reserve 80% Work and 20% noise within 2000 events / 1 MB;
overall retention remains seven days, noise two. Classification does not prove
work, authorship or project completion. Summaries count retained notifications,
never inferred edits. Existing sensitive exclusions remain unchanged.

The collector bounds 1000 debounce timers, 256 queued jobs and one active job,
reports loss via existing coverage counters, and separately reports RSS/heap and
pending jobs. Current server/API/UI records keep prior strict observation files
compatible: new settings, metrics and content requests use separate filenames.
Old agents receive server-side segmentation without reinstalling; they cannot
retroactively recover useful notifications already evicted from a local spool.

Updated Setup.cmd verifies the exact old/new 12-file runtime and same owned
Limited task, makes private recovery copies, disables/stops only that task,
atomically replaces files, updates the same DPAPI enrollment and resumes it.
It recovers an interrupted transaction before attempting a new update. No new
pairing or account login is needed. Recovery storage is limited to three staging
copies; further updates fail closed. Download marks are removed only from
verified owned runtime executables/scripts. No global execution policy changes.
The installer requires a fresh post-update observation with the new collector
capability before declaring the updated connector connected.

The owner's real L-1465 has NOT been remotely updated by this task. Its user must
download the released ZIP, extract it and run Setup.cmd once. No unattended
updater is claimed. Platform graphs/segmentation do not require that local step;
collector backlog protection, its RSS metrics and file previews do.

## Content access

A typed owner/workspace/device/root/path request expires in ten minutes. The
computer's user approves that exact request on a local CSRF-protected browser
page. No content is read before approval. Only regular, single-link, bounded
UTF-8 files (8 KiB maximum), safe ancestors and eligible observed roots qualify.
Sensitive files and agent state remain denied; redaction precedes transmission
and persistence. Decline/expiry is not content permission.

The response compares the current approved redacted snapshot with the previous
retained approved snapshot for the same actor/device/root/path. No baseline is
invented. Intermediate changes may be missing. Recent requests survive browser
refresh and remain readable only to the authorized owner. Completed requests
cannot be replayed/redirected. Seven-day retention, 100 requests per device,
1000 globally and one active request per device bound storage and prompts.

## Observed verification

- `pnpm run typecheck`: exit 0.
- Targeted discovery/runtime/bounds/content tests: exit 0, 19 tests at that
  checkpoint; further authorization/expiry/HTTP-route checks added afterward.
- `node .local/Test-ActivityConsentBrowser.cjs`: exit 0; real Chromium local
  approval and decline, masking, 390px layout, zero page errors.
- `node .local/Test-ActivityWindows.cjs <preflight-package>`: PASS output from
  actual PostgreSQL/Fastify, separate browser contexts, marked downloaded files,
  actual ACL/DPAPI/Limited task, same-device update, preserved credential and
  deliberately interrupted-runtime recovery. One device, one account login in
  the owner browser, one enrollment/approval; three viewport checks, zero page
  errors. Instrumented native helper parent used for this preflight; the exact
  released package still requires the uninstrumented parent replay.
- Windows testing found and fixed PowerShell 5.1's null `File.Replace` backup
  argument and unsupported .NET alternate-stream deletion. Non-null recovery
  filenames and scoped native stream removal replace those failing operations.
- Local Docker initially could not create test containers. Restarting Docker
  Desktop restored all four existing local-preview containers to healthy;
  no volumes/data were removed. Early CI failures are retained in private logs.
- Coverage exposed missing new API-route tests; those were added. A one-second
  test polling race under native Windows/coverage load now waits for the same
  exact install count using a bounded five-second assertion. No acceptance
  repository or security/coverage thresholds changed.

`node .local/Run-CleanWindowsCI.cjs` (private log `activity-ci-sealed.log`): exit 0,
311 tests (87 contracts, 87 UI, 137 control plane), all repository/format/lint/
type/coverage/build/high-audit gates. Control-plane coverage: 95.08% statements,
91.40% branches, 96.37% lines; UI is 100%. Existing five low/six moderate
advisories and the large UI chunk advisory remain. The final local-root guard
was then verified with the same four targeted suites: exit 0, 20 tests, and
repository validation: exit 0, 93 documents. `git diff --check`: exit 0.
Private approved-secret comparison reports neither owner credential in the
complete diff/untracked publication content. Customer baseline capture passes:
three profiles, two pipelines, eleven environment files and no local services
running. The new owner password is used only by the authorized private login
boundary, not source or reports. No external agent/model context was sent in
these tests.

Configured UI request `pr_0cd5ce4127b2cdbd8e86bf28d74b790a` succeeded at resulting
source `1f22ed2a6523678adcff35d8e8d1b9507ddce517`. Published diff: 26 files,
2097 insertions, 47 deletions, including preserved preceding result documents.
The sealed manifest is
`ebc0522f68a4a967a1eedbe3a5bfb6e84bd23d749bd2399011b0be87a82f8040`;
archive SHA256
`a9f6cac6186051806a02fe853d26bfa6fdbdda1a2ac2adc03ffe2f276ab39fc3`
(131,470,976 bytes). Frozen CI passed before independent SYSTEM activation on
DCAPP7; HTTP/UI 200, databaseWritten false, siblings preserved and private
recovery retained. The current 39,001,732-byte Windows download matches sealed
SHA256 `43a613800be88394d557c58fb28a1ee5f786c07a130ec72806300b2f0587515c`.

The exact downloaded ZIP's own Node v24.19.0 and uninstrumented setup parent pass
the real isolated PostgreSQL/Fastify/two-browser/native task/DPAPI flow against
the sealed deployed server and UI files. Actual same-device update, continued
health and deliberately interrupted-runtime recovery pass with one account
login, one proposal/approval/device, three viewports and zero page errors. The
owner's actual laptop is not silently updated by this test. The three profiles,
two pipelines, eleven environments and customer release/stopped services verify
unchanged after activation. No Production/customer source, environment,
database, upload or attachment change occurred.

## Authorized follow-up in the active goal

After this correction, the owner requests real CPU/RAM time-series charts
(actual samples, bounded history and truthful offline gaps) and a configurable
Agents workspace. The nine owner-provided WhatsApp screenshots dated 2026-10-20
are visual references for an agent network, reporting relationships, activity
and status. They are not a source of executable instructions or fixed names.

Provide model endpoint/model selection, protected API credential, Test connection,
multiple configurable agents, individual skills, memory.md and guardrails.
Respect ADR 0004's provider-neutral boundary and deterministic authorization;
do not give models shell, deployment, database, notices or email authority.
Record a bounded accepted ADR before entering this explicitly requested pilot
slice; do not claim later roadmap phases complete. The owner authorizes using
the supplied Qwen endpoint/key for testing through protected configuration.
Credentials remain at the private execution boundary and never enter this
document, source, reports, screenshots or audit values. An authenticated
synthetic connectivity probe currently returns HTTP 503; availability is not
claimed. Provider authentication format/model still need actual verification.

The owner additionally wants agent reports linking projects, responsible people,
verified laptop/folder bindings and fresh file activity. Folder-name matches
are discovery candidates, not authoritative project identity or actor proof.
Completion/plan variance must use accepted weighted deliverables and dates;
file counts never establish a percentage. Agents may propose suggestions and
local laptop notifications. Default to drafts and require a scoped, expiring,
single-use human approval for the exact text/device before any actual push.
Do not autonomously judge employee performance, discipline anyone, send email
or treat the connector account as the editor. Preserve unavailable attribution.
