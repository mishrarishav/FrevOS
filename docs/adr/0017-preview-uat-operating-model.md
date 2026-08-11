# ADR 0017: Operate Phase 4 Preview and UAT on Render and Auth0

- Status: Accepted
- Date: 2026-08-11

## Context

Phase 4 cannot exit on local service tests alone. It needs an authorized HTTPS
Preview or UAT target that runs the Control Center and BFF on one origin, uses
a real OpenID Connect provider, persists sessions and tenant data in PostgreSQL,
and can be exercised by the independent acceptance repository.

The operating decision is intentionally limited to non-Production. Customer
data, Production availability, regulatory residency, quantified service
objectives, and immutable artifact promotion need requirements that do not yet
exist. Selecting those by assumption would turn a Phase 4 validation target
into an unsupported Production commitment.

## Decision

### Runtime and region

- Use one paid Render Starter web service for the Phase 4 UAT Control Center
  and Fastify BFF. The service builds the pinned Dockerfile, listens on Render's
  expected port, and serves the compiled React application and API from the
  same origin.
- Use the Render-managed `onrender.com` hostname for UAT. Render provides and
  renews TLS and redirects HTTP to HTTPS. A custom domain is not required to
  establish Phase 4 evidence.
- Place the web service and database in `frankfurt`. Keep this UAT environment
  synthetic and non-sensitive. The Production region and legal data-residency
  boundary remain open until customer and compliance requirements exist.
- Keep automatic deployment disabled. A human-triggered UAT deployment may
  occur only after required CI passes on the exact merged source, the migration
  step succeeds, and the intended Render source revision is verified. Phase 9
  and Phase 11 own immutable release artifacts and the full deployment
  lifecycle; Phase 4 must not imply those capabilities early.

### PostgreSQL operating model

- Use paid Render PostgreSQL on major version 18, Basic-256mb compute, 5 GB
  storage, no platform connection pool, and the same Frankfurt region as the
  web service. The application keeps its bounded `pg` pool and transaction-local
  RLS context.
- Disable public database access after bootstrap by declaring an empty IP allow
  list. The web service uses the internal Render connection URL over the private
  network.
- Use two separately managed database credentials. `frevos_migrator` owns the
  privileged migration boundary and is never present in the running web
  service. A distinct Render-managed runtime login is verified as `LOGIN`,
  `NOSUPERUSER`, `NOCREATEDB`, `NOCREATEROLE`, `NOREPLICATION`, and
  `NOBYPASSRLS`, must not inherit `frevos_owner`, and may assume only the fixed
  `frevos_app` role. Its `frevos_app` membership explicitly disables automatic
  privilege inheritance and administration while retaining only `SET ROLE`.
- Run the repository migration command from an explicitly authorized temporary
  administration boundary. It applies checksum-verified migrations and grants
  `frevos_app` only after the separate runtime login passes the privilege
  checks. Remove the temporary external IP rule immediately afterward.
- Use a paid database because free Render PostgreSQL expires after 30 days and
  provides no backups. Paid instances receive point-in-time recovery; the
  Hobby workspace recovery window is three days. Create an on-demand logical
  export before a destructive UAT migration and perform a recovery exercise
  before Production readiness is considered.

### Identity and assurance

- Use a dedicated Auth0 EU tenant tagged `Staging`, separate from any future
  Production tenant. Register FrevOS UAT as an OIDC-conformant Regular Web
  Application using Authorization Code, exact HTTPS callback
  `<uat-origin>/auth/callback`, and no wildcard or localhost callback.
- Use Auth0 only as the authentication provider. FrevOS continues to identify a
  principal by exact issuer and subject, owns authorization and workspace
  membership, and discards provider tokens after callback validation.
- Disable public signup for UAT and permit only synthetic test identities.
  Require MFA for Auth0 dashboard administrators. End-user MFA is not claimed
  on the free UAT tenant; Production user assurance, enterprise federation,
  recovery, SCIM, and lifecycle policies remain explicit pre-Production
  decisions.
- Keep the Auth0 client secret and database URLs in their provider secret
  boundaries. Let Render generate the 256-bit OIDC transaction-cookie key.
  Never put any value in Git, GitHub variables, build arguments, logs, reports,
  or acceptance artifacts.

### Rotation and recovery

- Review and rotate the UAT database credential, Auth0 client secret, and OIDC
  transaction key at least every 90 days and immediately after suspected
  exposure or administrator removal. Rotation is an approved secret lifecycle
  action, not an automated model action.
- Rotate the database credential by creating and validating a new unprivileged
  Render credential, granting only `frevos_app`, updating `DATABASE_URL`,
  redeploying, observing the old connection drain, and then deleting the old
  credential.
- Rotate the Auth0 client secret through an announced UAT maintenance window;
  update the Render secret and redeploy before revoking the old value. The
  current adapter accepts one client secret, so zero-downtime dual-secret
  fallback is not claimed.
- Replacing the OIDC transaction key invalidates only outstanding login
  transactions. Existing FrevOS server sessions remain digest-backed in
  PostgreSQL and are not encrypted with that key.

The current public pricing evidence puts an always-on Starter web service plus
Basic-256mb PostgreSQL near USD 13 per month before bandwidth and storage
growth. Billing must be explicitly accepted by the human owner before
provisioning. Auth0's free plan is sufficient for this limited UAT assurance
policy; it is not the selected Production plan.

## Consequences

- The Phase 4 runtime can satisfy same-origin secure-cookie behavior without
  CORS or browser-managed tokens.
- A compromised web process does not receive migration authority, PostgreSQL
  ownership, `CREATEROLE`, or an RLS bypass.
- Initial bootstrap has an explicit human operating sequence because Render
  cannot safely derive a least-privilege runtime URL from its privileged
  database credential inside the service.
- UAT has managed TLS, private database traffic, PostgreSQL 18 parity, and
  short-window recovery, but no high availability or quantified SLO.
- Production cloud, region, identity plan, availability, retention, custom
  domain, and compliance remain open and cannot be inferred from this ADR.

## Rejected alternatives

- Free Render web and PostgreSQL instances, because idle spin-down, database
  expiry, and missing backups make acceptance evidence unstable.
- Separate static hosting and API origins, because that weakens the current
  host-cookie and same-origin BFF boundary.
- Giving the running service the migration credential or invoking migrations
  at process startup.
- Enabling automatic deployment before schema ordering, artifact identity, and
  rollback controls exist.
- Treating the Auth0 tenant as FrevOS workspace authorization.
- Selecting a Production platform without workload, residency, compliance,
  availability, and commercial requirements.

## Evidence

- [Render web services](https://render.com/docs/web-services)
- [Render Docker deployment](https://render.com/docs/docker)
- [Render TLS](https://render.com/docs/tls)
- [Render private networking](https://render.com/docs/private-network)
- [Render PostgreSQL creation, networking, and encryption](https://render.com/docs/postgresql-creating-connecting)
- [Render PostgreSQL recovery and backups](https://render.com/docs/postgresql-backups)
- [Render free-instance limitations](https://render.com/docs/free)
- [Render July 2026 cost snapshot](https://render.com/articles/how-much-does-cloud-application-hosting-cost-for-small-businesses)
- [Auth0 tenant regions and environment isolation](https://auth0.com/docs/get-started/auth0-overview/create-tenants)
- [Auth0 application settings](https://auth0.com/docs/get-started/applications/application-settings)
- [Auth0 MFA configuration](https://auth0.com/docs/secure/multi-factor-authentication/enable-mfa)
- [Auth0 client-secret rotation](https://auth0.com/docs/get-started/applications/rotate-client-secret)

## Related records

- [ADR 0005](0005-immutable-artifact-promotion.md)
- [ADR 0013](0013-fastify-control-plane.md)
- [ADR 0014](0014-oidc-bff-sessions.md)
- [ADR 0015](0015-postgresql-tenant-isolation.md)
- [Phase 4 UAT runbook](../PHASE_4_UAT_RUNBOOK.md)
