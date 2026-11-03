# Public browser gateway preparation

The requested address is `https://tserver2.eeslindia.org/devsetu/`. Server9 is
only the HTTPS routing gateway. The application, existing identity store,
pairings, domain services, background work and database remain on Server20.
The existing internal entry stays at `http://10.9.69.20`.

## Verified connection reference

TrackGRN's **Analyse all** chat and IMS's **Add SQLite UAT environment** chat
identify `DCPUBWEB.eesl.co.in` for Server9. Fresh Kerberos WinRM on port 5052
succeeds as administrator without reading or changing a password. IP-based
domain authentication had returned `STATUS_NO_LOGON_SERVERS`; the hostname
uses the existing domain authentication correctly. RDP port 5059 is separate.

Server9 reaches Server20 UI and health with HTTP 200. Existing ARR/URL Rewrite
are enabled. The shared wildcard certificate currently expires on 2026-11-18.
No certificate, binding, DNS or firewall change is proposed by this route.

## Prepared application behavior

An optional `servix/config/browser-entry.json` profile enables a second loopback
listener in the original process. It reuses the existing service instances and
database pool. The profile requires HTTPS public origin, a normalized prefix,
an explicit proxy Host allowlist and loopback binding. Absent configuration
keeps the existing application behavior. Wrong proxy source/Host is denied;
forwarded headers do not select origins or bypass the bounded login limit.

`deployment/server20/BrowserEntryBuild.json` selects the public UI build prefix.
`scripts/build-browser-entry.mjs` builds separate `dist-browser` assets and
matching metadata. Public session/CSRF cookies use that prefix's namespace,
preserving legacy cookie names and the secure host-only policy. The release
recipe includes the new module, fresh contracts, public assets and source
inventory. The existing `.env`/runtime profile is not rewritten.

This first entry provides administrator browser access. Paired-device sign-in,
connector endpoints, pairing and private preview retain their private-entry
requirements pending a verified connector endpoint migration. The public
listener explicitly rejects connector transport/private preview actions and
the public UI explains this limit. A public browser URL is not a full system
VPN, and a path does not isolate this app's browser origin from sibling apps.

## Native routing and preservation

`BrowserEntryIisModel.psm1` defines a profile-driven child application, dedicated
pool/farm, HTTPS boundary at the edge, source-address boundary at the upstream,
and pass-through of upstream status responses. It never changes global ARR
settings or existing bindings. `Plan-BrowserEntryIis.ps1` maps creation and owned
recovery against real IIS configuration before any live commit.

Server9 mapped creation/recovery PASS: existing configuration SHA256
`fe06eb79065bcd68f00a0c92e4a65ed3f590cd9fba6c30f28324faab51bd283a`,
proposed `25652aa8088b9e40d0ae83d78e6c96dd3657f23d6830e8eefd46a12830e5ad7d`.
Server20 native SYSTEM Plan/recovery PASS: existing
`204d1c51d699f836b4ee13f8d24b78dbda0cd625329080df3c87109b6594b1ac`,
proposed `45f36529d78dd7a25e40572bb5d92c028b110a651fd2ec428850e8edbc082bd7`.
Both preserve the sibling configuration fingerprint. Temporary native task
removal is verified. No live IIS commit or public application directory exists.

`Apply-BrowserEntryIis.ps1` checks an expiring, single-use, SID/actor/workspace/
operation/target/plan-bound approval and exact preimages before committing the
mapped change; failed health triggers owned resource recovery. Server20's
native wrapper additionally binds the active manifest and authenticated actor.
`Configure-BrowserEntry.ps1` requires a matching successful DevSetu activation
receipt before writing the new protected profile and restarting its exact task;
the original runtime file and task identity are checked and recovery is bounded.
These activation/recovery execution paths are not yet live acceptance.

## Validation and remaining work

Observed preparation checks include real isolated PostgreSQL identity/session,
workspace RLS, login/logout CSRF, Host/source denial, unavailable private
transport and login-rate limiting; current internal auth is retained. Native
profile validation rejects 11 unsafe configurations, and both real mapped IIS
plans pass. Type checks, public UI build and targeted UI tests pass before final
release freezing. Initial test expectation errors and a mapped XML comparison
bug were corrected; neither caused a live configuration change.

Final enrolled CI/artifact review, preserved-state snapshot, configured DevSetu
activation, profile/IIS activation and actual public browser/external-network
acceptance remain pending. Do not describe this preparation as a live public
deployment or as a completed source-to-deploy UI pipeline. GitHub publication
is not requested for this change.

The first frozen attempt (0254d3f) passes 541 tests and produces a signed APK,
but packaging is rejected by the old verifier's UI-directory allowlist. It is
not an approved artifact and is not activated. The verifier now admits only the
additional closed `dist-browser` tree with matching metadata/runtime, retaining
all hashes, budgets, path/link and file-set checks. The two required fixed
builder sidecars can be accompanied by the two named HTTP/capability verifiers,
with the same protected enrollment/task checks; arbitrary verifier filenames
remain rejected. Separately, the public
maintenance screen now renders its prefix and scoped CSRF cookie. Executed
JavaScript regression checks polling/submission for both entries; the authenticated
HTTP integration also checks the maintenance script/style URLs.

An active browser profile also gates native activation/recovery compatibility:
retain the browser capability and matching built prefix. Without an active
profile, recovery to the earlier application remains available. Real ZIP/file
fixtures cover both cases and reject mismatched assets. These checks complement
the prepared-artifact review; no live rollback is claimed by fixture results.

The corrected frozen attempt 850b80a fails two of 333 backend tests and is not
eligible for activation. The native guard's consumer assertion is corrected
from eight to thirteen checks and explicitly requires the three browser
capability/prefix results. Its four focused tests pass. The Linux fixture's
failure is a Docker/WSL runc crash; after the engine returns to Running, both
focused Linux tests pass. Four retained preview identities are healthy. A fresh
complete frozen CI/build is required; focused reruns do not qualify the failed
artifact. No application, route or data is activated by either rejected attempt.
