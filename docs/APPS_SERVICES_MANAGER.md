# Apps and services manager

2026-11-06, ADR 0102. Task branch `codex/apps-services-manager`, based on
`8ec671cc86fc0f721875894bfea0c02f15b199c1`. Application deployment and packaged
acceptance are recorded below when observed; the preceding inventory/explorer
release remains the live baseline until activation succeeds.

Discovery → Software now opens a Windows-style Apps & services workspace. Its
navigation separates Installed apps, Services, Approved catalogue and History.
Windows inventory separates Control Panel registrations, Microsoft Store apps
and the combined registered list. Machine registrations and the connector user's
app packages are included; this does not discover every portable executable or
other users' private app packages. Linux lists package-manager registrations.

Services includes running and stopped Windows SCM or Linux system/user systemd
services, status, startup type and selected-service details. Shared card/table
views, search, column filters, sorting, pagination and scoped session preferences
remain available. Primary controls stay outside the records scroller. Narrow
screens place the selected-service pane below the list with Start/Stop first.

Inventory consent permits reading services. Existing connections default to
service control Off. An owner can enable the separate local Software permissions
checkbox once. An administrator enables a particular service in the revisioned
per-device catalogue, then Start/Stop queues an exact audited request without an
additional DevSetu approval prompt. The existing software-install permission is
independent and is not enabled by this feature. Setup updates preserve a valid
existing service-control selection on Windows and Linux.

Each control request binds workspace, device, current administrator, operation,
policy revision and native definition digest. Claim consumes its short-lived
approval once; execution checks role, local consent, current catalogue and native
definition again. Native OS permissions still apply. Protected infrastructure and
connector services cannot be controlled. No custom command, binary, arguments,
startup changes, driver control or cascading Stop is exposed. An application
administrator does not receive an elevated Windows/Linux token. Definitions are
hashed locally; command lines and service-account identities are not uploaded.

Service scans replace bounded snapshots, independently of installed-app scans.
The connector negotiates server support before sending the new capability.
Default collection is every 30 seconds; connector `serviceRefreshSeconds` is
bounded to 15–300 seconds. A control requires a snapshot no older than 90 seconds;
Refresh services obtains one explicitly. Independent cursors avoid resending
unchanged snapshots to browser polling. Failed scans retain the previous
successful snapshot and display the failure separately. Service collection does
not append file-activity events or unbounded history.

## Pre-release evidence

- Actual Windows read: 320 services, including running and stopped services;
  current SCM access rights read without a service mutation. RPC infrastructure
  is protected and binary/account fields are absent from the snapshot.
- Typed server/client tests exercise consent, admin versus owner, cross-device
  and workspace scope, exact policy/definition, revocation after claim, expiry,
  receipts and replay. Their native action is a fixture, not a live OS change.
- Native Linux adapter fixtures cover fixed arguments, system/user separation,
  native permission denial, active dependents and changed definitions. Existing
  actual Linux installed-connector/migration test passes; its systemd manager
  remains explicitly stubbed.
- Browser layout fixture: 278 apps / 325 services, desktop, 768×1024 tablet and
  390×844 mobile. Category counts, Start/Stop result states, restricted user,
  final-row filtering and card/table filter separation verified. These are
  synthetic records and do not establish live service-control acceptance.
- Control-center full suite: 123 tests, tracked API/experience/routing coverage
  100%. Software-management scoped suite: 32 tests; statements 95.38%, branches
  94.71%, functions 100%, lines 96.2%. Full original native CI remains required.

## Release and operational acceptance

Pending immutable build, native Plan/activation, preservation checks and live
public UI acceptance. A disposable native service lifecycle will be exercised
where existing OS authority is available. No existing user/production service
will be stopped as a test. ESDS/L-1465 offline acceptance remains unavailable
unless those computers reconnect. A connector update is required to report the
new service capability; pairing and existing data remain retained.
