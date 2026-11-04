# Public device transport and connected-system Explorer

Status: Deployed on Server20 on 2026-11-04. Public transport, L-1770 project
connector reporting and the actual public Explorer UI are verified. Other
device and login acceptance limits are listed below.

The owner keeps the existing public gateway IP and `/devsetu/` entry. Server9
only routes; Server20 retains the application, database, identities and state.
No new DNS or public preview port is introduced. ADR 0099 records the scope.

## Deployed release

| Item | Verified value |
| --- | --- |
| Source | `b8d2e38c59ee4aac22db7b943814e267b26a38c1` |
| Manifest SHA256 | `ae5f7f0ee8e95d7bd1e6b069474e1cbf04e8e40e9b14d549bcc80492c737ed58` |
| Archive SHA256 | `88ebea5a6385e5fb2b94982942a08888d949544fc986b6a93bd6eb92de5794b2` |
| DevSetu candidate | `4c24f3837b574b4181703fc681ecb4fb` |
| UI activation request | `su_1e73c76b48b58062d8d3defb8dae2445` |
| Activation completed | `2026-11-04T07:57:46.604Z` |
| Public entry | `https://tserver2.eeslindia.org/devsetu/` |

Preparation used the enrolled DevSetu native build adapter. Activation was
submitted through the authenticated DevSetu maintenance UI and native Apply
returned PASS. This is not a claim that preparation used a UI build-only API,
that source was published to central Git/GitHub, or that this handoff edit is
part of the already activated artifact.

## Implemented behavior

- Configured HTTPS server bases retain their path prefix in Node, Windows,
  Linux and Android clients. Public transport is explicitly enabled by the
  browser-entry profile; omitted/false retains its old behavior.
- Public registered-device login uses a connector-page transaction and existing
  device/owner proof. URL changes retain existing pairing credentials and
  permissions, verify the new endpoint first and retain bounded recovery.
  The protected discovery identity namespace survives a server URL change, so
  the same physical installation does not become a second system row. Fresh
  enrollments persist the server's canonical namespace before the first start.
- API request/response inspection reaches only a configured managed service
  through its authenticated connector queue. Responses are inert text/JSON or
  Base64; proxied HTML/scripts do not execute on the login hostname. Requests
  are bounded, sent once, audited and cancelled without replay. Full application
  preview retains its separate-hostname requirement and private entry.
- Discovery shows a computer overview separately from its project connections.
  The shared desktop styling and compact public-connection chip replace the
  raw notice/layout problem. File activity has clear Work/Temp/All segments.
- Explorer lists drives, folders and file metadata including ZIP, with Location,
  Back/Forward/Up, search and pagination. New folders/files use exclusive empty
  creation; existing files, links and protected locations are not overwritten.
  Selected text files can use the existing explicit, locally approved masked
  content/snapshot comparison flow. Admins use verified workspace scope;
  ordinary users retain ownership isolation.
- New Explorer capability and job records preserve old connector/record
  compatibility. Old connectors remain folder-only until their runtime update.
  Browser transport metadata prevents a capability-losing recovery while that
  profile is active.

## Preservation and validation

Full native CI passed 573 tests in 113 test files across the three suites.
Focused checks exercise actual Windows creation and DPAPI recovery, isolated
non-root Linux file operations, authorization/revocation, traversal/link and
creation-conflict rejection, public URL prefix/proof boundaries, inert API
responses and request limits/cancellation. Typechecks and local UI production
builds pass. The artifact contains 4,076 manifest files and 272 source-inventory
files; packaged compiled modules, both UI output trees, public transport
metadata and all three installers were checked against the frozen build.

The actual public UI now passes the layout check: the old wide notice is absent
and the workspace retains usable width. L-1770's Explorer was exercised through
that public entry: C: and D: drive metadata, ZIP file visibility, folder
creation, exclusive zero-byte file creation, editable Location and
Back/Forward/Up navigation passed. The temporary test file and folder were
cleaned up without recursive deletion. ZIP contents were not read. This is
recorded as `PASS_CLEANED` in `.local/public-device-explorer-live-test.json`.
Earlier synthetic design fixtures remain visual evidence only.

The actual public TLS-chain repair is complete and independently verified by
strict Node and OpenSSL clients; see
[PUBLIC_TLS_CHAIN_REPAIR_HANDOFF.md](PUBLIC_TLS_CHAIN_REPAIR_HANDOFF.md).
Post-activation private/public health checks returned 200. Anonymous public API
access and unauthenticated connector access returned 401. The public connector
flag is enabled. Windows/Linux/Android downloads from both private and public
entries matched the reviewed hashes; public downloads passed strict TLS.

The 33-file selected protection snapshot and follow-up checks retained eight
pairings, five stable settings and 17 software records. Existing data, retained
environment/configuration, IIS and preview relay were preserved. The separate
browser-profile operation enabled the public connector flag while preserving
the existing profile keys. Selected snapshots are not database backups; no
schema migration or actual full-platform rollback drill is claimed.

Credential qualification rehashed the previously reviewed baseline and checked
the frozen source/artifact delta, including verified public certificate and
official container-image digests. Direct comparison against the current
provider key was unavailable; this is not a new exhaustive secret audit.

Existing saved activity settings were preserved. L-1770's Tracking settings were
then saved with 24 Temp/Cache/Tooling rules, including exact npm/build-cache
folders; the complete rules and changed-file manifest are recorded in
[PUBLIC_DEVICE_EXPLORER_CHANGESET.md](PUBLIC_DEVICE_EXPLORER_CHANGESET.md).
The verified settings summarize
matching activity over 30 seconds, retain Temp activity for at most two days and
reserve at most 20% of the event/storage budget for that segment. With seven-day,
2,000-event retention, the verified segment ceilings are 400 Temp and 1,600 Work
events. Applying new rules immediately reclassifies retained history and
reapplies its quotas: the final public UI showed 653 Work and 400 Temp events.
Excess activity metadata ages out; files on the laptop are not deleted.
These limits bound retained metadata; they do not prove who edited a
file or measure project completion. Additional cache patterns must be appended
through Tracking settings for each configured policy; they are not silently
applied to every paired computer.

## One-time connector update

Use the latest installer under the same OS user. Choose Advanced update, keep
the existing pairing/code blank and retained permission selections, and use the
complete configured public URL including `/devsetu`. A transport update verifies
the existing device at the new HTTPS endpoint rather than creating a new one.
Android exposes Change server address · keep pairing. Do not substitute a fresh
registration for an update or claim phone/Linux-desktop acceptance from local
fixtures.

Existing Windows project connectors have a separate typed `Discovery`/`Transport`
update in `Update-PreviewConnector.ps1`. It updates only the five manifest-bound
collector/browser sidecars. Transport derives the new URL from the active,
hash-bound Server20 browser profile, verifies the same device/owner/workspace and
profile at both endpoints, and preserves the installed-old discovery identity,
credential, project folder, consent bytes, task and ACLs. It waits for the exact
old worker to stop and verifies the restarted task; failure restores and checks
the old files/configuration. A fresh server observation is still required after
the real update. Customer source folders are not changed by this operation.

L-1770's project connector was migrated to
`https://tserver2.eeslindia.org/devsetu` with its existing device ID, physical
installation identity, canonical discovery namespace and consent permissions.
The independent verifier observed fresh public-credential, Discovery and
Explorer proofs after the repair below. The namespace remains the retained
`http://10.9.69.20` identity namespace; it is not the request destination and must
not be replaced just because the transport URL changes.

The live update exposed a legacy prerequisite gap: the old project installation
did not contain `GitDesktop.cjs`, which the new connector imports. The five-file
Discovery/Transport update therefore did not initially leave a running worker.
An artifact-bound, exclusive one-file repair supplied that missing dependency;
it preserved protected configuration, permissions, task definition and root ACL,
then verified the running task and fresh retained installation identity. This
was a recovery after the observed gap, not a clean first-attempt migration.
Evidence is in `.local/git-dependency-repair-gdr_38f084551cf0467d9614c0afb998f5fa/result.json`
and `.local/l1770-public-connection-verification-00c26b3605e44cacbdc2db4945ebc620.json`.

Before applying the five-file migration to another old pre-Git project runtime,
apply its matching Git runtime update while the connector is online, or use the
complete current installer under the same OS user with the retained pairing.
Do not assume Discovery/Transport alone installs every missing legacy runtime
dependency.

New executor enrollments support prefixed public bases; existing executor DPAPI
endpoint migration is not part of this release. Do not infer that all existing
executors have moved from private to public transport.

## Acceptance still outstanding

- L-1465 was offline; its connector migration and the cross-laptop live API
  GET/POST test remain pending. The public inert API inspector is implemented,
  but this release does not claim that pending test passed.
- Actual Android-phone and Linux-desktop update/login acceptance, and ordinary
  non-admin paired-user sign-in, remain untested in this rollout. No test with
  the laptop VPN explicitly disconnected is recorded.
- Full interactive HTML application preview remains on the private isolated
  preview entry. The owner declined additional DNS/hostnames, so the shared
  public login origin provides inert API inspection rather than executing a
  laptop application's HTML/scripts there.
- Existing executor endpoint migration, GitHub/source publication and a full
  platform rollback exercise were not performed by this rollout.
