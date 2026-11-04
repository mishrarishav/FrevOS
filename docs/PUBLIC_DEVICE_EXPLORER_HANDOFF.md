# Public device transport and connected-system Explorer

Status: Implementation and focused validation PASS; frozen full native CI,
artifact activation and actual paired-device/public acceptance pending.

The owner keeps the existing public gateway IP and `/devsetu/` entry. Server9
only routes; Server20 retains the application, database, identities and state.
No new DNS or public preview port is introduced. ADR 0099 records the scope.

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

Focused checks exercise actual Windows creation and DPAPI recovery, isolated
non-root Linux file operations, authorization/revocation, traversal/link and
creation-conflict rejection, public URL prefix/proof boundaries, inert API
responses and request limits/cancellation. Typechecks and local UI production
builds pass. Local browser design fixtures contain synthetic data and establish
visual behavior only; they are not live connector acceptance.

The actual public TLS-chain repair is complete and independently verified by
strict Node and OpenSSL clients; see PUBLIC_TLS_CHAIN_REPAIR_HANDOFF.md. The
application baseline remains source 6c666a4 until the next exact activation.
Fresh pre-build observation confirms eight pairings and five stable settings.
Selected snapshots are not database backups; no schema migration is included.

Existing saved activity settings are preserved. Append the recommended browser
cache rules through Tracking settings for an already configured computer before
claiming its old Edge/Chrome profile paths have moved to the Temp segment.

## One-time connector update

Use the latest installer under the same OS user. Choose Advanced update, keep
the existing pairing/code blank and retained permission selections, and use the
complete configured public URL including `/devsetu`. A transport update verifies
the existing device at the new HTTPS endpoint rather than creating a new one.
Android exposes Change server address · keep pairing. Do not substitute a fresh
registration for an update or claim phone/Linux-desktop acceptance from local
fixtures. Actual updated-device acceptance remains pending at this checkpoint.

Existing Windows project connectors have a separate typed `Discovery`/`Transport`
update in `Update-PreviewConnector.ps1`. It updates only the five manifest-bound
collector/browser sidecars. Transport derives the new URL from the active,
hash-bound Server20 browser profile, verifies the same device/owner/workspace and
profile at both endpoints, and preserves the installed-old discovery identity,
credential, project folder, consent bytes, task and ACLs. It waits for the exact
old worker to stop and verifies the restarted task; failure restores and checks
the old files/configuration. A fresh server observation is still required after
the real update. Customer source folders are not changed by this operation.

New executor enrollments support prefixed public bases; existing executor DPAPI
endpoint migration is not part of this release. Do not infer that all existing
executors have moved from private to public transport.
