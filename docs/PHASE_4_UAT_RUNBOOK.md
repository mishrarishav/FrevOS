# Phase 4 Preview and UAT Runbook

## Purpose and authority boundary

This runbook prepares and verifies the non-Production Phase 4 UAT environment
selected in [ADR 0017](adr/0017-preview-uat-operating-model.md). It does not
authorize billing, account creation, secret lifecycle changes, deployment,
acceptance-repository changes, or Production access. Each external action still
needs the human authorization required by repository and platform policy.

Use only synthetic identities and data. Never paste a secret into source,
commits, pull requests, chat, shell history, screenshots, traces, videos, or
reports. Inject migration values process-locally from an approved secret
boundary and clear them when the command exits.

## Immutable inputs to record

Before provisioning or deploying, record these non-secret values in the Phase 4
handoff:

- reviewed FrevOS source commit SHA and successful `CI / validate` run;
- Render workspace, Blueprint, service, database, region, and deployment IDs;
- exact Render source commit and deployment status;
- UAT HTTPS origin;
- Auth0 tenant region and issuer, application ID, and enabled connection names;
- PostgreSQL major version and non-secret runtime role name;
- migration command exit code, health result, and acceptance source SHA;
- backup/recovery evidence and every known deviation.

Do not record database URLs, passwords, client secrets, transaction keys,
session cookies, authorization codes, or provider tokens.

## 1. Configure the isolated Auth0 tenant

1. Create or select an EU Auth0 tenant dedicated to UAT and tag it `Staging`.
2. Require MFA for every Auth0 dashboard administrator.
3. Create a Regular Web Application named `FrevOS UAT`, keep it OIDC conformant,
   and enable only the Authorization Code grant required by the BFF.
4. Set the exact allowed callback URL to `<uat-origin>/auth/callback`. Do not add
   wildcards, localhost, Preview hosts, or Production hosts.
5. Set the application login URI to `<uat-origin>/auth/login` and the allowed
   logout URL to `<uat-origin>/`. FrevOS currently revokes its own session only;
   provider-global logout is not claimed.
6. Enable only the intended synthetic UAT connection, disable public signup,
   and provision the minimum test identities needed for acceptance.
7. Capture the non-secret issuer and client ID. Put the client secret only in
   the Render secret field when the service is configured.

## 2. Provision Render resources

1. Review [`render.yaml`](../render.yaml) and the estimated paid baseline before
   accepting any billing impact.
2. Create a Render Blueprint from the FrevOS repository and the reviewed
   default-branch revision. The Blueprint declares a paid Starter web service
   and paid PostgreSQL 18 in Frankfurt. Automatic deployment remains off.
3. Confirm PostgreSQL reports major version 18, Basic-256mb compute, 5 GB
   storage, no connection pool, and no public IP allow-list entry.
4. The first service deployment may remain unavailable until the separately
   managed runtime database credential and OIDC values are configured. Do not
   represent that state as a deployed UAT target.

## 3. Establish separate database authority

1. Retain the original `frevos_migrator` credential only in the approved
   migration boundary. Never add `MIGRATION_DATABASE_URL` to the Render web
   service.
2. In Render PostgreSQL credentials, create a separately managed runtime login
   with a name matching `^[a-z][a-z0-9_]{2,62}$`, such as
   `frevos_runtime_uat`. Capture its internal connection URL only in the Render
   `DATABASE_URL` secret field and its external URL only in the temporary
   migration boundary.
3. Temporarily allow only the migration operator's exact public IP on the
   database. Do not use `0.0.0.0/0`.
4. From the reviewed source commit, build the control plane and run the
   migration command with both `MIGRATION_DATABASE_URL` and `DATABASE_URL`
   injected by the secret boundary:

   ```sh
   pnpm --filter @frevos/control-plane build
   pnpm --filter @frevos/control-plane migrate
   ```

   The command applies checksum-verified migrations, verifies that the runtime
   login is unprivileged, and grants only the ability to assume `frevos_app`. It
   fails closed for a missing, owner-capable, role-creating, database-creating,
   superuser, replication, or `BYPASSRLS` login. The resulting membership has
   `INHERIT FALSE`, `SET TRUE`, and `ADMIN FALSE`, so direct login-role queries
   do not receive application privileges.
5. Remove the temporary public IP rule immediately. Confirm the database has an
   empty public allow list before continuing.
6. Put only the runtime internal URL in the Render service's `DATABASE_URL`.
   Confirm the service environment does not contain `MIGRATION_DATABASE_URL`.

## 4. Configure and deploy the web service

Set these Render service values without exposing their contents:

| Variable | Source |
| --- | --- |
| `DATABASE_URL` | Separate unprivileged runtime internal connection URL |
| `FREVOS_PUBLIC_ORIGIN` | Exact Render HTTPS origin, with no path |
| `FREVOS_OIDC_ISSUER` | Exact Auth0 EU issuer |
| `FREVOS_OIDC_CLIENT_ID` | Auth0 Regular Web Application client ID |
| `FREVOS_OIDC_CLIENT_SECRET` | Auth0 secret boundary |
| `FREVOS_OIDC_TRANSACTION_KEY` | Render-generated 256-bit value |

Confirm `HOST=0.0.0.0`, `PORT=10000`, and `NODE_ENV=production`. Then manually
deploy the reviewed default-branch commit. Verify from Render evidence that the
deployment source SHA is exact and that no newer or older commit was selected.

## 5. Runtime verification

The deployment is not ready until all of these observations pass:

1. Render's `/health` check is green. A database connectivity failure must
   return `503` with `{"status":"unavailable"}`.
2. `GET /` returns the Control Center HTML over HTTPS with `no-store`, CSP,
   frame denial, MIME sniffing denial, referrer restriction, permissions
   restriction, and HSTS headers.
3. A hashed `/assets/` response is immutable; a missing API or asset path
   returns a real 404 instead of the SPA shell.
4. An unauthenticated browser sees the honest sign-in state. Login redirects to
   the exact Auth0 tenant and callback returns to the same UAT origin.
5. Browser storage contains no provider access, refresh, or ID token. The
   FrevOS session cookie is host-only, `Secure`, `HttpOnly`, and
   `SameSite=Strict`.
6. A synthetic identity with no membership sees the empty-workspace state. An
   authorized synthetic identity sees only its workspace, client, and project
   records. Cross-workspace requests remain denied.
7. Logout revokes the FrevOS session, clears the host cookies, and makes the
   previous session unusable. Auth0 single sign-on state may still exist and is
   a documented limitation, not a failed FrevOS revocation.

## 6. Independent acceptance boundary

Product-facing acceptance must be implemented and reviewed separately in
`mishrarishav/FrevOS-Acceptance`; this production repository must not edit those
tests. Pin the exact deployed FrevOS source identity and target only UAT over
HTTPS. Add the minimum secret-handling contract needed for synthetic Auth0
authentication without putting credentials or session state in reports or
retained browser evidence.

At minimum, the independent suite must cover desktop and mobile unauthenticated,
successful authentication, empty membership, authorized workspace rendering,
session expiry/logout, permission denial, responsive behavior, accessibility,
console errors, and network failure. It must also retain the harness protections
against skipped, focused, weakened, or Production-bound tests.

Phase 4 is not complete until that separate change passes against this exact
authorized deployment and its reviewed evidence contains no secret material.

## 7. Backup and rotation checks

- Confirm paid point-in-time recovery is active and record the available
  recovery window without exporting sensitive contents into project evidence.
- Before a destructive UAT migration, create an on-demand logical export and
  record only its provider identifier and completion state.
- Exercise recovery to a separate database before claiming Production
  readiness; deletion of the current database is never part of a recovery test.
- Review all three UAT secret rotations at least every 90 days. Production
  rotation frequency, RPO, RTO, high availability, and retention remain open.

## Rollback and failure handling

If migration, role verification, OIDC discovery, health, or acceptance fails,
stop and preserve the last healthy service. Do not weaken RLS, reuse the
migration credential at runtime, enable a broad database allow list, bypass CI,
point acceptance at Production, or edit independent tests merely to obtain a
pass. A destructive database restore, secret rotation, or resource deletion
requires its own explicit human approval.
