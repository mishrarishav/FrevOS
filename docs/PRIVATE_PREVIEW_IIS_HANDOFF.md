# Private VPN preview: IIS route preparation

Status: PASS for preparation; activation and browser acceptance pending.

Update 2026-11-03 15:10 IST: cf959bd's approved activation failed its incorrect
403 denial expectation and recovered the exact IIS/relay preimages. The first
receipt did not retain the actual HTTP status, so it is not asserted here. Eight
pairings/five settings/five software records verify after recovery. ADR 0093
records the revised operator: require the existing relay's 401 plus fixed denial
body, preserve upstream error bodies in the new site and retain numeric failure
status. The old approval is consumed; revised review/approval is pending.
The revised native mapped Plan (pvi_95806a05bd7147fcb114a3708d2c551b) passes
creation/recovery and sibling preservation; proposed IIS SHA256 is now
204d1c51d699f836b4ee13f8d24b78dbda0cd625329080df3c87109b6594b1ac.
Thirty local checks pass again. The existing real relay authentication test
(`pnpm.cmd --filter @frevos/control-plane exec vitest run
test/preview-relay.test.ts -t "requires exact Host"`) passes, one test with 18
unselected; exit 0. Repository validation passes for 146 Markdown files and
`git diff --check` exits 0. These scoped checks do not repeat the full app build.

Repository: mishrarishav/FrevOS (provider ID 1329122983). Branch:
`codex/software-inventory-vpn-preview`. Bounded base:
`62d58eff3a4120d26e859cccbab9647d3bd36483`. Phase 4 remains open. No pull request,
GitHub push or merge is performed for this operation. The frozen operator source
commit and exact payload hashes are recorded in the private final review.

Scope is one explicitly owner-selected private hostname route through existing
Server20 IIS port 80. The active application remains source 2f70b82, manifest
acce2b5c3e12c3628aa66bf425db89243d405555167d2172398b9cb832906428.
No new application build, customer project deployment, DNS/firewall rule, database
write, credential lifecycle change or pairing change is included.

The operator creates a dedicated hostname-only site, pool and ARR farm, preserves
the upstream Host header within that farm, and moves the existing relay to
loopback with its private hostname on port 80. Global proxy settings and existing
IIS resources are compared before/after in a mapped private copy. The IP-based
DevSetu portal remains the login origin. The new site's access and failed-request
logs are disabled to avoid writing preview ticket material. Physical-folder access
is limited to existing operator identities and the IIS read identities; parent
permissions are unchanged. Original configuration files are retained privately.

Apply requires a fresh exact actor/workspace/target/correlation/payload/operator/
manifest-bound human approval, consumed before side effects. The configuration
intent expires after ten minutes, approval after at most fifteen. Live baselines
are rechecked immediately before changes. Recovery removes only owned IIS
resources when its last written hash still matches and restores the previous
relay via the qualified v2 configuration operator. Concurrent unrelated changes
fail closed and retain evidence for owner recovery. Plan validates removal on a
mapped copy; no live failure/recovery is claimed before activation.

Observed validation on 2026-11-03:

- `powershell.exe -NoProfile -NonInteractive -ExecutionPolicy RemoteSigned -File
  deployment/server20/Test-PrivatePreviewIisModel.ps1`: exit 0, 30 checks PASS,
  including 12 invalid payloads and 15 invalid/expired/mismatched approvals.
- Python AST parsing of `PreviewConfigurationRemote.py` in the existing pinned
  Docker tooling image: exit 0. The transport accepts only the fixed typed
  `iis-preview` operator and hashed intent, not arbitrary commands.
- `.local/Prepare-IisPreviewRoute.ps1`: native read-only Plan exit 0 / READY;
  mapped schema creation and removal/recovery PASS, sibling fingerprint preserved,
  live IIS unchanged, temporary execution task removed. Preparation correlation
  pvi_2bb0b480cfd642d6a7d386db838a2087. Final frozen-source Plan gets its own record.
- Proposed IIS artifact SHA256:
  baa22d92885e548e1e0d37408f91e26466a261bacb4496064e9bf258e2ae6591.
- Existing IIS sibling fingerprint:
  8e51d9ac499c979152aa2106b1f3d51422b5b6627e1da29cdb6e5bcdc4cf474c.
- `git diff --check`: exit 0. No dependency changes or application rebuild in
  this bounded operator preparation. Existing app source previously passed 526
  native tests; those tests are not represented as rerun for this operator.

An initial local test invocation hit the process execution-policy default; using
the explicit existing RemoteSigned process option succeeded without changing
machine policy. A test fixture initially used a syntactically valid alternate
question reference as its invalid case; corrected to an absent reference. No
acceptance test or production guard was relaxed.

Changed files in this bounded operation:

- deployment/server20/Configure-PrivatePreviewIis.ps1
- deployment/server20/PrivatePreviewIisModel.psm1
- deployment/server20/PreviewConfigurationRemote.py
- deployment/server20/Test-PrivatePreviewIisModel.ps1
- docs/CURRENT_STATE.md
- docs/PRIVATE_PREVIEW_IIS_HANDOFF.md
- docs/adr/0092-private-preview-iis-host-route.md
- docs/adr/0093-private-preview-denial-contract.md (follow-up repair)
- docs/adr/README.md

Next boundary: show exact frozen source and payload review, obtain the requested
single-use approval, activate, verify unauthenticated preview denial and portal
health, then perform actual L-1770 browser GET/POST against the temporary L-1465
API. Close the preview lease and stop only the owned demo; reverify eight stable
pairings, five settings and existing software records. Until then this handoff
does not claim the end-to-end API test complete. The existing Windows connector
and both software opt-ins are already observed; no additional connector update
is required for this server-side routing change. Inventory previously collected
367 installed-program records. Third-party software installation, real Linux
desktop and Android acceptance are not established by this preparation.
