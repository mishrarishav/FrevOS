# Private VPN preview and software lease acceptance

Status: PASS for the bounded Server20 release and real L-1770 to L-1465
inventory/demo/API workflow, verified 2026-11-03 18:46 IST.

## Active release

- Application source: 76254040cb62ae8e4baa147d5b2e6d5712b53e88.
- Manifest: 357d14c96de6b5238459e25cc591b7c7f738063481053ff0364c63af74931f5e.
- Archive: 4bcd0c6548c27bfb227afa99b8feb9f364a6e33f625d22f67c44ae746a0afd94,
  132,081,294 bytes; 4,058 package files and 251 committed source inputs.
- Builder: cj_12c1066f7fe6c795fabb65d6d6e4c897; candidate/native operation:
  cc8a91b8b59149f6b958c1f9415b1185.
- Actual authenticated DevSetu maintenance request:
  su_efd2c30c78bd3d8be5d2f628e3d86a76, actor usr_windows_admin,
  workspace ws_server20 / mishrarishav/FrevOS/server20, target DCAPP7/10.9.69.20.
- Exact owner approval call_8e12a5fb0cf54d5aaada01d48d5a2806 was received and
  consumed. Native Apply, HTTP health and UI health pass; private recovery
  backups remain retained. No live rollback or schema migration is claimed.

ADRs 0095 and 0096 fix two observed defects: no-referrer suppresses Origin on
the cross-origin bootstrap form, and separate clock reads can create a job or
approval one millisecond longer than the strict connector limit. Use strict-origin
only with configured preview origins, and derive each expiry from its own single
creation/issuance instant. Exact Origin, duration, digest, consent, role, device,
workspace and catalogue checks remain enforced. No timing tolerance is added.

## Observed validation

- Deterministic advancing-clock regression fails old source with 3,600,001 ms
  versus the 3,600,000 ms limit; corrected code passes. Forty-one related tests
  pass, including the actual software client and relay.
- Enrolled full native CI: 104 files, 527 tests (97 contracts, 108 UI,
  322 backend), build and audit gates PASS. Coverage: statements 95.14%,
  branches 91.81%, functions 97.16%, lines 96.87%. Audit: five low and eight
  moderate advisories; no high/critical advisory or dependency change.
- All package/source/archive hashes verify. Actual packaged Control Center
  policy probe and fresh control-center/software-management output comparisons
  pass. A real browser fixture uses the actual packaged SoftwareManagement,
  SoftwareClient, child DemoApi and PreviewRelay to prove bootstrap/cookie/GET/
  POST; its own lease/service/storage cleanup passes. This fixture is separate
  from the subsequent actual cross-laptop acceptance.
- Native read-only Plan and 14-file private selected snapshot PASS. This is a
  selected settings/identity snapshot, not a database backup.
- Actual activation uses DevSetu maintenance UI. Live strict-origin and scoped
  form CSP are verified. Eight stable pairings, five settings and all ten
  preexisting software records verify before the intentional inventory refresh.
- Windows 20-file and Linux 14-file runtime closures PASS. All three served
  downloads match the active manifest. Android uses retained signing certificate
  0d3a704822eacaef060a4560c2f800479179eed96dfbf9e94993dcf2b75cec92.

Credential qualification is a verified qualified baseline plus frozen-source
delta and independently derived retained IIS/relay digest evidence. Unknown
digest-shaped source values fail closed. The former exact-key journal is
unavailable; no repeated direct-current-key scan or exhaustive secret audit is
claimed. Current provider keys are not supplied to the builder or this handoff.

## Real inventory and cross-laptop browser proof

Source device L-1465: fc_edbd12b849d785d005803001334ce346, system-monitoring mode,
same existing pairing and owner, inventory/install permissions retained.

- Fresh inventory request sw_68de3048a3b9129c6916820ebed28e31 succeeds:
  367 entries, observed 2026-11-03T13:06:20.051Z.
- Temporary API start sw_93f97a430c4527f96f04dcb69350af97 succeeds from the
  approved catalogue, port 5080 and 900-second lifetime. Job duration is exactly
  one hour; approval duration exactly ten minutes.
- Actual L-1770 browser opens the authenticated preview. GET returns machine
  L-1465 and the matching start-job instance. POST returns that same machine/
  instance and echoes nonce demo-1793711350471-165573b7f255.
- Preview audit records open 13:08:01.213Z and close 13:11:33.444Z. Reloading the
  original browser after close is rejected; independent route check returns
  401 with the exact expected denial body.
- Owned stop sw_7f2adf9c5f519661c808b66cdde6a63f succeeds. Latest capability has
  zero services. No customer project is changed, and no third-party program is
  installed as part of this demo.

The earlier interrupted inventory request remains in history. Nine historical
software/catalogue/job records remain byte-identical. The tenth original record,
the inventory snapshot, changes intentionally only through the successful fresh
inventory operation after deployment preservation was already verified.

IIS remains 204d1c51d699f836b4ee13f8d24b78dbda0cd625329080df3c87109b6594b1ac;
relay configuration remains
005b5e44bdb4bb875408906045977f6c15334a4b1e08d3a97f608194ae301c11.
Updater integrity and health 200 verify. Pairings, settings and environment are
preserved; no connector reinstall is required for these server-side fixes.

## Where the API is hosted

The source API process runs on **L-1465**, bound to its loopback port 5080. While
started, use `http://127.0.0.1:5080/` on L-1465 itself. Its program is the owned
connector DemoApi.cjs runtime, not a customer project.

L-1770 uses `http://dcapp7.eesl.co.in/` as a private VPN gateway. That hostname
reaches Server20's isolated IIS port-80 route, then the loopback relay and the
paired L-1465 connector. L-1465 handles the request and returns its response.
The gateway hostname does not mean the source application runs on Server20.
This is the configured HTTP preview transport, not a claim of general TCP/UDP
mesh networking or a public Internet tunnel.

The temporary API and preview access are stopped after acceptance. To repeat:
Discovery → L-1465 → Software → Approved catalogue → Temporary VPN demo API →
Install. Port/lifetime are configurable. On L-1465 open its localhost address;
on another authorized browser use Open VPN preview. Finish with Close VPN preview
and Stop temporary API. Existing Windows/Linux connectors do not need reinstall.

## Evidence and limits

Private evidence is retained under the task worktree's `.local/software-origin-*`
records: exact build/CI, artifact/installer review, packaged browser proof,
native Plan, selected snapshot, activation receipt, served downloads, actual
browser result, lease-closure UI and final acceptance. GET/POST, inventory and
actual activation screenshots are in `.local/evidence`.

The earlier failed preparation and obsolete cancelled build remain recorded.
An automatic approval review blocked deleting one older local failed-fixture
folder without a detailed reason; it is left untouched. The later packaged
fixture's own stop and cleanup pass. Production/user data is unaffected.

Phone and genuine Linux desktop acceptance, unrelated third-party installation,
live rollback and a generic source-to-deploy UI pipeline are not established by
this bounded work. Preparation uses the configured enrolled native builder;
activation is through the actual authenticated DevSetu UI. No GitHub push, PR,
merge or central-source publication is performed in this operation. Subsequent
documentation commits do not change the active immutable application source.
The broader Phase 4 readiness gates remain separate.
