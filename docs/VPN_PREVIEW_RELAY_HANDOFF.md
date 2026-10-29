# Private VPN preview relay

Status: IN PROGRESS. Code and validation are in progress; no live VPN deployment
or physical second-laptop browser acceptance is claimed.

Repository: mishrarishav/FrevOS, worktree
D:\FREVOS\.local\worktrees\servix-dashboard.
Branch: codex/vpn-preview-relay.
Base: d4967eca5272cc1360245e44336a738151b6e325.
Resulting commit / PR: none; no GitHub push or merge.
Scope: [ADR 0075](adr/0075-private-preview-request-response-relay.md), bounded
Phase 4 continuation explicitly stacked on the existing deployed source.

## Use and configuration

1. Update the source laptop's project connector with the reviewed Windows/Linux
   package. The Windows Update-PreviewConnector.ps1 operator preserves existing
   credentials/pairing, task definition and permissions; do not rerun enrollment
   as an update. Merely deploying the portal does not update an installed
   connector. System-only and Android
   monitoring connections cannot host project previews.
2. In Local development, stop the relevant service, open Configure local
   services, select Allow VPN preview and set its optional API route prefix.
   This reuses the selected local API service; ports and source folders come
   from the existing project configuration. Save and start/restart normally.
3. An administrator creates operator-owned config/preview-relay.json under the
   configured FREVOS_SERVIX_DEPLOYMENT_ROOT, using
   deployment/servix/PreviewRelay.example.json as a template. Replace workspace,
   paired device, profile, service and origin with actual verified IDs. Do not
   place credentials in this file. Keep its ACL writable only by approved
   operators and readable by the control-plane identity.
4. Configure private DNS for each preview hostname to the VPN-facing server.
   With a loopback listener, the existing private ingress must forward that
   hostname to the configured preview port, preserve Host and reject other
   hosts. Alternatively bind the listener to an explicitly configured private
   VPN interface/address. No public address, wildcard listener, firewall change
   or automatic DNS mutation is performed by this implementation.
5. Restart the control plane with the validated configuration. A configured
   origin must have a different hostname from DevSetu and every other preview
   origin, resolve only to private/loopback addresses and remain permanently
   bound to the same device/profile/service. Do not recycle an origin for
   another project. Separate browser origins preserve the application and
   DevSetu session boundary. The example is not a preconfigured live endpoint.
6. Open DevSetu from the other VPN-connected browser, select the paired project
   source and click Open VPN preview. A one-use POST opens the configured private
   origin with its own HttpOnly cookie. No pairing credential, DevSetu cookie or
   bootstrap ticket is placed in its URL. Close VPN preview revokes access;
   expiry, sign-out, membership/connector revocation and service changes also
   stop access. There is no automatic application start.

Owner access follows existing paired-device and workspace permissions. Configured
Discovery administrators can be authorized by the same server policy; ordinary
users cannot open another owner's connector. No new live role grants are made.

## HTTP behavior

Requests and responses remain memory-only, bounded by configurable time/body/
concurrency limits. Claims are delivered once. Lost responses/timeouts never
automatically replay a POST or another application action. Restart loses preview
sessions and pending transport; return to DevSetu and open a new preview.
Lifecycle audit stores scoped IDs/operation/time, not application paths, queries,
headers, bodies, cookies or credentials. Audit capacity fails closed at 10,000
files; retention follows the operator's evidence policy.

The relay preserves status, binary data and app cookies, strips hop-by-hop and
DevSetu credentials, and rewrites local redirects to the configured origin.
Root assets and relative frontend API calls work under the isolated origin.
When VPN preview is enabled, recognised frontend API variables are supplied as
the configured relative API prefix when starting; source .env files are not
rewritten. Applications with their own hardcoded localhost URLs or strict
origin/secure-cookie requirements still need their own ordinary dev settings.
Upstream redirects are never fetched by the connector; external redirects are
rejected. Streaming/SSE and application WebSocket upgrades are unsupported;
development HMR may need manual reload. No generic TCP tunnel or remote shell.

## Delivery evidence

Pending final validation, complete changed-file list and diff review. Local
tests are isolated synthetic fixtures and must not be described as live VPN or
physical second-laptop acceptance. Customer applications, uploads, attachments,
environment files and Production remain outside this implementation task.

The owner now approves Server20 rollout and using the existing DCAPP7 name.
DNS lookup from this client returns Server20; the actual DevSetu session verifies
through the approved private sign-in boundary. Servix development's paired
source is Online with its two local services Stopped. No local service is started
and no live runtime sidecar/configuration is changed at this checkpoint.

Local browser evidence: the real VpnPreviewButton posts its one-use ticket to
a different hostname, opens a real HTTP application, completes a browser POST
through the relay and rejects access after Close. Operator-only screenshot:
.local/vpn-preview-browser-response.png. The first 303 bootstrap exposes a real
SameSite=Strict redirect-chain failure; a committed HTML transition retains
Strict cookie protection and the repeated browser flow succeeds. This uses
synthetic paired records and loopback servers, not two physical laptops.

The source relay has 18 passing tests and standalone coverage gates PASS
(statements 96.78%, branches 91.15%, functions 100%, lines 99.23%). Initial
full-CI outcomes are retained: one new fixture array failure, then all tests
passing with global statement coverage 94.72% below the unchanged 95% gate.
Additional disconnect/close/upgrade/configuration/credential boundary tests
address the missing cases; rerun full CI before publication.

Windows file/DPAPI and fixed-task-transport fixture operators PASS: seven
source-update checks, six private-configuration checks and five executor-update
checks. Their task/health transport is simulated; native live acceptance is not
claimed. Each operator binds scope, expiry, before bytes and target identity,
keeps preimages and restores a failed start. The configuration binds the exact
active manifest and authenticated publication actor. The executor update keeps
the SDK/signing reference and cipher bytes unchanged. Actual application source
publication/build/deploy remains the configured DevSetu workflow.

Final local CI: `node .local/Run-PreviewCI.cjs
C:/Users/APPC0024/AppData/Roaming/npm/node_modules/pnpm/bin/pnpm.cjs` exits 0.
There are 86 passing files / 427 tests (contracts 14 / 90, UI 17 / 103,
backend 55 / 234). Backend coverage: statements 95.16%, branches 91.59%,
functions 96.78%, lines 96.71%; all unchanged gates pass. Build passes; the
high-severity dependency audit passes with 5 low and 6 moderate advisories.
After review corrections, format validation, repository validation (116
Markdown files) and git diff whitespace validation pass. The HTTP preview
button reuses the existing getRandomValues ID boundary; it does not require
secure-context-only randomUUID. The configuration fixture also preserves the
actual default-policy legacy control-task launcher. Packaging takes the updated
compatibility guard from frozen source, preserving the downgrade boundary.
Operator receipt paths and live deployment identities will be recorded after
the configured flow completes. Physical second-laptop acceptance is pending.

Native fixed prerequisite updates PASS on the existing Limited per-user builder
and Server20 System destination: pve_951efe01357d41b5a98d9ec099171a41 and
pve_2ae0d68b24ca434dbc45da878b3dc526. Actual task, encrypted enrollment, native
adapter bytes and parent permissions are preserved; preimages are retained.
Destination preflight and apply both remove only their own temporary RPC task.
The first transport observation fails before task creation because of an SDK
method-name mismatch; the corrected fixed transport passes actual preflight
and apply. No SDK/key re-enrollment, customer deployment or network-rule change.
Retained local operator evidence: .local/preview-builder-reference.json,
.local/preview-destination-reference.json and their scoped result JSON files.
