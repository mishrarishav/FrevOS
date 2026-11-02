# Approved-join onboarding observations and login diagnosis

Date: 2026-11-02 IST. Roadmap: bounded Phase 4.
Historical diagnosis snapshot: the statements below describe the notes-only
stage. Subsequent owner requests expanded the same isolated worktree into
`codex/simple-join-approvals`; ADRs 0084/0085 and the
[implementation handoff](SIMPLE_JOIN_IMPLEMENTATION_HANDOFF.md) record the
later runtime changes and validation separately.

Status: PASS for observation recording and read-only diagnosis. No runtime fix,
new pairing, ownership reassignment, publication or deployment is claimed.

Repository: mishrarishav/FrevOS, provider ID 1329122983.
Notes branch: codex/paired-login-onboarding-notes, isolated worktree.
Base: 758d44497d55142d07bc9d6ecc23d668350f3168.
Resulting commit / PR: none; two documentation files remain uncommitted.
The base inherits the unmerged Paperclip release stack. These notes add no
dependent runtime implementation or later roadmap phase.

## Owner observations and requested experience

| Observation | Required follow-up |
| --- | --- |
| Before approval, sign-in says the username/password is wrong. | Explain the requester's own pending approval state using the existing requester-bound transaction, rather than mislabeling it as a bad password. Do not expose another account's existence from an arbitrary username. |
| Windows ZIP exposes Node, modules and several setup launchers. | Provide one clearly identified standard installer entry; keep compatibility launchers out of the ordinary onboarding choice. A single installer is requested, not implemented here. |
| Approval, computer pairing and browser sign-in are unclear. | Display separate account approval, computer connection and browser sign-in stages, with one next action. |
| Reopening setup can reuse an existing connection for a different account from the intended approved join. | Show the existing assigned account and intended join account before success; accept the approved join code explicitly. Never silently reassign an existing connector or its private credentials. |
| Setup says connected, but Discovery/project links open sign-in. | Explain that monitoring connection is not a browser session. Use one primary next action and remove the competing project action until onboarding completes. |
| Correct credentials plus a device-verification challenge still display a registration error. | Render the verification challenge as the next sign-in step. Separate it from genuinely missing pairing, offline connector and expired proof. |
| The owner would prefer a continuous sign-in experience after connection. | Evaluate a short-lived, single-use, browser-bound sign-in handoff after approval/pairing; do not put passwords/proofs in URLs, store plaintext passwords, bypass the paired-device proof or transfer another browser's session. |

The owner asks to retain observations while testing. Installer redesign,
authentication changes and a new Server20 rollout require a separate bounded
implementation and validation. No existing authorization or proof check is relaxed.

## Fresh evidence and diagnosis

The authenticated admin browser at Server20 Discovery was inspected around
21:37–21:38 IST. The new Windows account request is Approved, not Paired.
Discovery's three visible grouped systems all show the administrator connector
account. The owner confirms that the affected second computer is L-1465;
its online monitoring row is assigned to that administrator, not the newly
approved account. No account-owned connection for the new requester is visible.

Thus approval has not completed that request's connector redemption. The
existing administrator connection's healthy report is not proof of pairing for
the newly approved user. This explains the ordinary user's current sign-in
block without requiring a password reset or removal of the existing pairing.
The other laptop's setup form, submitted join code and HTTP response were not
directly inspected; omission of the join code is a likely path, not an observed
form submission.

Relevant deterministic code:

- `apps/control-plane/src/join-requests.ts`: approval creates an ordinary
  account; connector redemption is a separate account/device-bound operation.
  Prepare reports the approved owner and scope. Redemption enforces the same
  platform and file-activity choice.
- `deployment/servix/DeviceEnrollment.cjs`: without a supplied join code,
  prepare may resume the existing protected system connection. A supplied code
  selects approved join preparation/redemption. Connected means authenticated
  health was observed; it does not create a browser session.
- `apps/control-plane/src/device-logins.ts`: ordinary login requires the
  authenticated user's own active system pairing and fresh connector proof port.
  Administrator registration does not imply ownership by the approving admin.
- `apps/control-center/src/api.ts`: HTTP 202 connector-page login returns
  `DeviceVerificationRequired`, a subtype whose message is
  `paired-system-required`.
- `apps/control-center/src/App.tsx`: that challenge both stores verification
  and sets the generic device error state. The existing computer-registration
  error is therefore shown together with a legitimate Verify-computer next step.
- `deployment/servix/START-HERE.txt`: approved join codes must be entered in
  setup with the same reviewed file-activity choice; ordinary HTTP sign-in then
  uses Verify for this computer and explicit local confirmation in the same browser.

The pre-approval password message also follows current behavior: no new login
identity exists until approval. It does not establish that the chosen password
was typed incorrectly. A requester-bound pending-state message remains a UX
requirement; it is not implemented by these notes.

## Immediate supported path

On the affected laptop, reopen the same extracted package's Setup.cmd and enter
the code from the original approved request in Approved join code, with the same
file-activity selection. After successful redemption, the admin request should
show Paired for that user. Use that user's credentials, then Verify this computer
and Confirm sign-in in the same browser. If the code is expired, request another
computer for the existing approved account and obtain a fresh admin approval;
do not create the same new account again or delete unrelated connections.

This path is guidance from the existing protocol. Its successful execution on
the other laptop has not been observed. No pairing code or credential is copied
into this record.

## Validation and delivery

Changed files: this document and `docs/CURRENT_STATE.md`.
Diff stat: 2 files, +111/-0.
Validation is proportional to this documentation-only change:
`node scripts/validate-repository.mjs`: exit 0, 131 documents;
`git diff --check`: exit 0.
No application build, authentication regression run or new security scan is
claimed. The runtime fix should cover correct-password challenge presentation,
requester-bound pending state, foreign-owner resume, successful join redemption,
same-browser confirmation, wrong owner, expiry, replay and pairing preservation.

Next bounded work: implement and test onboarding state/message corrections,
then qualify a simpler installer and optional browser handoff without weakening
ADRs 0071/0072. Production activation remains separate.
