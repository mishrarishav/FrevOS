# ADR 0057: Built backend artifacts and preservation-first promotion

Status: Accepted for the owner's bounded Servix request, 2026-10-25.

The owner requests a runnable backend build instead of copying the source tree,
real deployment through DevSetu, Development verification before Production,
and preservation of all existing uploads, attachments and other files. This
task is explicitly stacked on deployed `69dd69e12649d30e9c63a453cb526ea373b17a10`
in `feature/servix-build-artifact`; preserve preceding result documentation.
Phase 4 exit remains open. This does not authorize unrelated roadmap work.

Supersede ADR 0039's source-only backend packaging for this opt-in artifact
path after verification. Retain the historical adapter and saved releases;
never weaken its current Production exclusion to make onboarding appear ready.
Production execution needs a separately approved, scoped target binding and an
actor/workspace/action/target/correlation/expiry/artifact-bound approval.

Compile from an isolated, identity-verified checkout. Preserve per-module
filesystem locations and per-project dependency resolution: uploads, branding,
reports, environment editing and QuerySafe must keep using their existing data
roots even when application code comes from a bundle. Build output must exclude
environment values, credentials, user files, source trees and runtime caches.
Validate required installed dependencies before changing a running service.

Prefer immutable, versioned bundle files and an audited runtime selection over
overwriting existing source. Existing files are not automatically deleted.
Retain verified backups and prior runtime/task definitions. Compare protected
files and IIS configuration before and after; links, collisions, unverified
scope, concurrent drift and incomplete inventories fail closed. Code rollback
does not reverse database state. Production startup/database effects require
explicit review; isolated tests must never use a writable Production database.

Use DevSetu's authenticated publication/build/deployment flow for real acceptance.
Build the backend once, record its digest and Development result, and prepare
the identical bytes for Production. A target activation envelope may differ;
the promoted backend artifact must not be rebuilt. Test health, attachment
serving and code rollback. Never present a pending/unconnected profile as ready.

Read-only server21 evidence: IIS `support` binds HTTP 80/HTTPS 443 for
`support.eesl.co.in`, frontend `D:\Servix\frontend`; API/upload rewrites use
localhost:5000. `support_files` on HTTPS 81 serves `D:\oracle\blob`, which is
outside the application root and must remain outside deployment writes.
The owner reports manual VS Code `npm start` for Production. Direct laptop CIM
and Kerberos WinRM inspection were unavailable. A later read-only inspection
through server20's existing SYSTEM/DPAPI connection verified Production PID
10760, started 2026-09-28, under its existing interactive owner; Development
PID 18292 runs as SYSTEM. Node is v20.11.1. Preserve this distinction when
preparing initial adoption; moving Production to SYSTEM is not assumed safe.
SHA256 inventories of the Production uploads/external storage, Development
uploads/database, environment files and IIS settings are retained privately.
Development's existing launcher/task and port-5001 health were verified read-only.
