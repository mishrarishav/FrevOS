# ADR 0019: Operate Phase 4 UAT on Oracle Always Free and Auth0

- Status: Accepted
- Date: 2026-08-15
- Supersedes: [ADR 0017](0017-preview-uat-operating-model.md) for hosted Phase 4 UAT

## Context

ADR 0017 selected a paid Render web service and database so Phase 4 could obtain
stable hosted acceptance and managed recovery evidence. The product owner has
instead selected a zero-cost route. The local Preview from ADR 0018 remains
useful but cannot substitute for an independently reachable HTTPS UAT target.

The replacement must preserve the same-origin OIDC BFF, PostgreSQL 18 isolation,
separate migration and runtime credentials, synthetic-only data, exact source
identity, and recovery exercise. It must also make the reduced operational
assurance of a free, self-managed VM explicit. This is not a Production hosting
decision.

## Decision

### Runtime and cost boundary

- Use one Oracle Cloud Infrastructure Always Free Ampere A1 Compute instance in
  the account home region. Select Ubuntu 24.04 for `aarch64` and stay within the
  conservative free allocation of two OCPUs and 12 GB memory.
- Use a 50 GB boot volume and one 50 GB data volume, remaining below the 200 GB
  combined Always Free boot and block-volume allowance. Never rely on trial
  credits or silently select a paid shape, load balancer, database, IP, backup,
  support plan, or cross-region resource.
- Capacity is not guaranteed. If the home region reports no A1 capacity, wait
  or choose another explicitly approved free route; do not convert the action
  into a billable deployment.
- Record the tenancy, home region, compartment, instance OCID, VCN and subnet
  OCIDs, reserved public IP, volume OCIDs, image identity, shape, allocated
  OCPUs and memory, and the provider cost estimate without recording secrets.
- Treat Oracle's idle-instance reclamation policy as an availability risk.
  Synthetic UAT does not claim an SLO, high availability, or Production
  durability.

### Network and HTTPS boundary

- Give the instance a reserved public IPv4 address. Publish only TCP 80 and 443
  through an OCI network security group. Do not expose PostgreSQL 5432, Docker,
  an administration UI, or the Caddy admin API.
- Do not permit public SSH. Use OCI Bastion with a time-limited session for
  administration, and keep the instance subnet ingress rules closed on port 22.
- Run Caddy, FrevOS, and PostgreSQL with Docker Compose. Only Caddy publishes
  host ports. PostgreSQL is attached solely to an internal Docker network;
  FrevOS joins the internal database network and the outbound-capable edge
  network.
- Use a human-controlled DNS name when available. For the zero-cost fallback,
  use the reserved IPv4 address encoded in an `sslip.io` hostname. Caddy obtains
  and renews the public certificate after the hostname resolves and ports 80
  and 443 are reachable. Record `sslip.io` availability, third-party DNS
  dependency, and certificate-authority rate limits as UAT risks.

### Identity, database, and secrets

- Continue to use one dedicated Auth0 EU Free tenant tagged `Staging`, exact
  callback and logout URLs, disabled public signup, and synthetic test users.
  Auth0 authenticates; FrevOS remains the workspace authorization authority.
- Build the repository Dockerfile for `linux/arm64` at the exact reviewed source
  SHA. Pin the PostgreSQL 18.4 and Caddy 2.10.2 multi-platform images by digest.
- Keep `frevos_migrator` inside the one-shot migration and recovery boundary.
  The running app receives only the separately generated `frevos_runtime`
  login, which the migration command verifies as unprivileged before granting
  its bounded `frevos_app` membership.
- Store the Auth0 client secret, transaction key, and generated database
  passwords only in `/etc/frevos/uat.env`, owned by `root:root` with mode 0600.
  Do not put secrets in cloud-init, OCI instance metadata, Git, commands, chat,
  screenshots, logs, reports, or retained browser artifacts. Host root and the
  Docker daemon remain a trusted secret boundary for this self-managed UAT.
- Secret creation, replacement, and revocation remain separate explicitly
  authorized actions. The checked-in configuration contains placeholders only.

### Recovery and evidence

- Persist PostgreSQL, Caddy state, and logical backups under `/srv/frevos` on
  the dedicated block volume. Back up that volume using no more than the five
  included Always Free volume backups and confirm the provider estimate remains
  zero before enabling each policy.
- Run the checked-in systemd timer for one daily custom-format `pg_dump`. The
  job validates the archive with `pg_restore --list` before publishing the
  filename and emits no database content.
- Exercise the checked-in isolated restore check before Phase 4 exit. It
  restores the latest logical archive only to the fixed
  `frevos_restore_check` database, validates required relations, and drops that
  temporary database. It never restores over the active UAT database.
- Record timestamps, exit status, backup filename, OCI volume-backup identifier,
  and restore-check outcome. Production RPO, RTO, retention, point-in-time
  recovery, encryption-key ownership, availability, and disaster recovery
  remain open.

## Consequences

- Phase 4 can obtain an Internet-reachable same-origin HTTPS target without an
  ongoing hosting fee when OCI, Auth0, DNS, and certificate use remain within
  their free allocations.
- The product image and database security model remain consistent with the
  prior hosted package, and the database has no public listener.
- TLS, patching, disk monitoring, backups, restore drills, capacity, and host
  recovery are now operator responsibilities. Free service capacity and
  availability can interrupt acceptance.
- The logical restore drill and limited volume backups are weaker than managed
  point-in-time recovery. This is acceptable only for synthetic Phase 4 UAT and
  cannot be promoted as a Production recovery model.
- `render.yaml` and ADR 0017 remain historical deployment evidence but are no
  longer the active hosted UAT route.

## Rejected alternatives

- Continue with paid Render, because the product owner selected a free route.
- Treat the laptop Preview as hosted acceptance evidence, because it is not an
  independently reachable and stable HTTPS target.
- Expose PostgreSQL or SSH publicly for convenience.
- Put credentials in cloud-init, repository variables, Compose files, shell
  command arguments, or model-visible automation.
- Use OCI trial-only or accidentally billable resources to work around A1
  capacity.
- Claim the self-managed logical backup as Production point-in-time recovery.

## Evidence

- [OCI Free Tier](https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier.htm)
- [OCI Always Free resources](https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm)
- [OCI network security](https://docs.oracle.com/en-us/iaas/Content/Security/Concepts/security_core_services.htm)
- [OCI public IP addresses](https://docs.oracle.com/en-us/iaas/Content/Network/Tasks/managingpublicIPs.htm)
- [Docker Engine on Ubuntu](https://docs.docker.com/engine/install/ubuntu/)
- [Caddy automatic HTTPS](https://caddyserver.com/docs/automatic-https)
- [`sslip.io` wildcard DNS](https://sslip.io/)
- [Auth0 pricing](https://auth0.com/pricing)

## Related records

- [ADR 0005](0005-immutable-artifact-promotion.md)
- [ADR 0014](0014-oidc-bff-sessions.md)
- [ADR 0015](0015-postgresql-tenant-isolation.md)
- [ADR 0017](0017-preview-uat-operating-model.md)
- [ADR 0018](0018-local-preview-operating-model.md)
- [Phase 4 UAT runbook](../PHASE_4_UAT_RUNBOOK.md)
