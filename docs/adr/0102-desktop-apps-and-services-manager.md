# ADR 0102: Desktop apps and typed service management

Status: Accepted for the owner's 2026-11-06 installed-apps/services request and
Windows-style UX correction. Phase 4 remains open; builds on ADRs 0087–0088/0101.

Provide a Windows-style Apps & services workspace: persistent command bar,
section navigation, a bounded sortable/filterable list and selected-service
details/actions. Separate Control Panel desktop applications, Store applications
and OS services. Collect running and stopped services, status, startup type and
manager scope. Preserve previous successful snapshots on collection failures.

Read inventory under existing installed-inventory consent. Service control is a
new, separate one-time local opt-in, initially off for existing connections.
Only administrators can configure a versioned per-device service-control catalogue
and issue Start/Stop for a currently observed, explicitly enabled service.
Ordinary users retain their own inventory view without control authority.

Jobs pin actor, workspace, device, catalogue revision, service identity/definition
digest, operation and expiry. Use the existing durable audited queue/receipts and
single-use administrator authorization; recheck role, consent, current catalogue
and native definition immediately before execution. No arbitrary service names,
commands, arguments, binaries, force/cascade stop, startup changes, uninstallation,
driver control or restart/shutdown action can be submitted.

Native service controls run with the connector's existing OS identity. Windows
uses SCM StartService/ControlService with zero custom arguments, no dependent
service traversal, and bounded status observation. Linux uses fixed systemctl
operations for validated system/user .service units without a shell or password
prompt. OS access denial is reported honestly. This request does not silently
elevate an existing connector or enroll a privileged broker. A different OS
authorization, if necessary, must be made concrete and reviewed separately;
an application administrator role never changes an OS access token.

Protect OS infrastructure and the connector's own service; native OS restrictions
and running-dependency checks remain effective. Service definitions/command lines
are hashed locally, not copied to browser/audit payloads. Catalogue choices and
bindings are configuration, not customer-project conditionals.

Exercise actual OS inventory and an isolated disposable service lifecycle where
OS authority is available. Do not stop existing user/production services for a
test. Distinguish actual native execution, protocol fixtures and unavailable
privileged targets. Preserve pairing, software-install consent, data, environment,
source repositories and existing applications. Deployment uses the existing
reviewed immutable artifact and actual DevSetu activation flow.
