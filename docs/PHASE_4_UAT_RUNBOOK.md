# Phase 4 Oracle Always Free UAT Runbook

## Purpose and authority boundary

This runbook prepares and verifies the synthetic non-Production Phase 4 UAT
environment selected in
[ADR 0019](adr/0019-oracle-free-uat-operating-model.md). It supersedes the
Render procedure from ADR 0017. It does not itself authorize Oracle or Auth0
account creation, payment-method submission, secret creation or rotation, live
deployment, destructive storage initialization, acceptance-repository changes,
or Production access. Treat each as a distinct external action and obtain the
required human authorization before executing it.

Never paste a secret into source, commits, pull requests, chat, shell history,
cloud-init, instance metadata, screenshots, traces, videos, or reports. The
checked-in example environment contains placeholders only. The approved host
configuration script reads the Auth0 secret from the terminal without echo and
creates the remaining credentials inside the root-only host boundary.

## Immutable inputs to record

Before provisioning or deploying, record these non-secret values in the Phase 4
handoff:

- reviewed FrevOS source commit SHA and successful `CI / validate` run;
- Oracle tenancy and home region, compartment, instance, VCN, subnet, network
  security group, reserved public IP, and volume OCIDs;
- Ubuntu image identity, Ampere A1 shape, OCPU, memory, and storage allocation;
- Oracle cost-estimate result showing no trial-only or billable resource;
- exact public hostname and HTTPS origin;
- Auth0 tenant region and issuer, application ID, enabled connection names, and
  synthetic test-user subjects;
- PostgreSQL major version and the non-secret runtime role name;
- exact deployed Git SHA and `frevos:<sha>` local image identity;
- migration, health, logical backup, volume backup, isolated restore, and
  independent acceptance results.

Do not record database URLs, passwords, client secrets, transaction keys,
session cookies, authorization codes, or provider tokens.

## 1. Create the isolated Auth0 boundary

1. Under separate external-account authorization, create or select one EU Auth0
   Free tenant dedicated to UAT and tag it `Staging`. Require MFA for dashboard
   administrators.
2. Create an OIDC-conformant Regular Web Application named `FrevOS UAT`. Enable
   only the Authorization Code grant required by the BFF.
3. Disable public signup and enable only the intended synthetic UAT connection.
   Create the minimum admin, viewer, and no-membership identities needed by the
   independent acceptance suite.
4. After the OCI reserved IP is known, select a human-controlled DNS name or the
   zero-cost `<reserved-ip-with-dashes>.sslip.io` fallback. Confirm it resolves
   to the exact reserved IP.
5. Configure exact URLs with no wildcards, localhost, Preview, or Production
   hosts:

   | Auth0 setting | Exact value |
   | --- | --- |
   | Allowed callback URL | `https://<uat-host>/auth/callback` |
   | Application login URI | `https://<uat-host>/auth/login` |
   | Allowed logout URL | `https://<uat-host>/` |

6. Retain the non-secret issuer, client ID, and exact test-user subjects. Keep
   the client secret only for the later approved root-terminal prompt.

## 2. Provision only Always Free Oracle resources

1. Oracle signup normally requires phone and payment-card verification even
   when only Always Free resources are used. Account creation and payment-method
   submission need explicit human authorization. Never upgrade the account or
   consume trial credits for this route.
2. In the tenancy home region, create a dedicated `frevos-uat` compartment and
   a VCN with one Internet-connected subnet. Create one network security group
   whose public ingress contains only TCP 80 and 443. Do not add public ingress
   for TCP 22, 5432, Docker, or the Caddy administration port.
3. Create one reserved public IPv4 address. Ephemeral addresses are not accepted
   because the OIDC callback and certificate hostname must remain stable.
4. Create one Ubuntu 24.04 Ampere A1 `aarch64` instance with two OCPUs, 12 GB
   memory, a 50 GB boot volume, and the reserved public IP. Confirm every console
   cost estimate is zero and every selected resource is labeled Always Free.
5. Create and attach one 50 GB Always Free block volume. Before formatting,
   identify its exact device from OCI attachment metadata and verify it is the
   new empty volume. Formatting is destructive and requires its own approval.
   Mount the verified ext4 filesystem at `/srv/frevos`, add it to `/etc/fstab`
   by UUID, reboot once, and verify the mount before writing data.
6. Create an OCI Bastion session for time-limited administration and restrict
   the target's SSH ingress to the Bastion path required by Oracle. Do not open
   SSH to `0.0.0.0/0` or leave a permanent public administration path.

If A1 capacity is unavailable, stop and retry later. Do not choose a paid shape,
trial-only database, load balancer, or other billable substitute.

## 3. Prepare the reviewed ARM64 host

1. Through the authorized Bastion session, patch Ubuntu and install Git, OpenSSL,
   and Docker Engine plus the Compose and Buildx plugins using Docker's official
   [Ubuntu installation procedure](https://docs.docker.com/engine/install/ubuntu/).
   Docker-published ports can bypass host firewall rules, so the OCI network
   security group remains the authoritative public ingress boundary.
2. Verify the host and tools without printing environment data:

   ```sh
   uname -m
   docker version
   docker compose version
   docker buildx version
   ```

   `uname -m` must return `aarch64`.
3. Create `/opt/frevos`, clone the public production repository exactly to
   `/opt/frevos/repository`, fetch the reviewed merged commit, and check it out
   detached. Confirm `git rev-parse HEAD` equals the recorded SHA and
   `git status --short` is empty.
4. Review [`compose.oci.yaml`](../compose.oci.yaml),
   [`docker/oci/Caddyfile`](../docker/oci/Caddyfile), and the two scripts in
   [`scripts`](../scripts). Confirm that only Caddy publishes host ports and
   PostgreSQL remains on the internal `backend` network.

## 4. Establish the secret boundary

This action generates database passwords and an OIDC transaction key and writes
the Auth0 client secret to `/etc/frevos/uat.env`. It is a secret-lifecycle change
and must be explicitly authorized separately from provisioning.

From the reviewed repository, run:

```sh
sudo sh /opt/frevos/repository/scripts/configure-oci-uat.sh
sudo sh /opt/frevos/repository/scripts/oci-uat.sh validate
```

Enter only the requested values at the interactive terminal. The script refuses
to overwrite an existing secret file, requires a clean exact checkout, creates
`/etc/frevos/uat.env` as `root:root` mode 0600, and prepares the fixed
`/srv/frevos` directories. Do not use `set -x`, redirect the prompt, print the
file, run `docker compose config` without `--quiet`, or retain terminal capture.

Replacing the file, changing an Auth0 client secret, or rotating either database
credential needs a new authorization and a documented maintenance procedure.

## 5. Deploy the exact reviewed source

Deployment is a distinct external action. Once it is authorized, run:

```sh
sudo sh /opt/frevos/repository/scripts/oci-uat.sh up
sudo sh /opt/frevos/repository/scripts/oci-uat.sh status
```

The wrapper fails if the checkout is dirty or differs from the SHA bound into
the root-only environment. Compose builds the FrevOS runtime for `linux/arm64`,
runs checksum-verified migrations with `frevos_migrator`, verifies and grants
the unprivileged `frevos_runtime` role, seeds synthetic identities, and starts
the app behind Caddy. Neither the app nor Caddy receives migration authority.

Confirm Caddy obtains a trusted certificate. DNS must resolve to the reserved IP
and ports 80 and 443 must be reachable for automatic HTTPS. Do not disable TLS
verification or replace public UAT HTTPS with an internal certificate.

## 6. Runtime verification

The deployment is not ready until all observations pass:

1. `GET /health` over HTTPS returns `200` with `{"status":"ok"}`. A database
   connectivity failure must return `503` with `{"status":"unavailable"}`.
2. `GET /` returns the Control Center over HTTPS with `no-store`, CSP, frame
   denial, MIME-sniffing denial, referrer restriction, permissions restriction,
   and HSTS headers.
3. A hashed `/assets/` response is immutable; missing API and asset paths return
   real 404 responses rather than the SPA shell.
4. The unauthenticated browser shows the honest sign-in state. Login redirects
   only to the exact Auth0 tenant and returns to the same UAT origin.
5. Browser storage contains no provider token. The FrevOS cookie is host-only,
   `Secure`, `HttpOnly`, and `SameSite=Strict`.
6. The no-membership identity sees the empty-workspace state. Authorized
   synthetic identities see only their workspace, client, and project records;
   cross-workspace requests remain denied.
7. Logout revokes the FrevOS session and makes it unusable. Remaining Auth0
   single-sign-on state is a documented limitation, not FrevOS global logout.
8. OCI network rules expose only 80 and 443, `docker compose ps` publishes no
   database port, and the running web container does not contain
   `MIGRATION_DATABASE_URL`.

Use `sudo sh /opt/frevos/repository/scripts/oci-uat.sh logs` only during an
authorized troubleshooting window. Caddy access logs are disabled so OIDC
callback query parameters are not retained. Review output before preserving any
evidence.

## 7. Backup and isolated recovery check

1. Install the checked-in systemd unit and timer as root, review their exact
   contents, then enable the timer under separate external-system authorization:

   ```sh
   sudo install -o root -g root -m 0644 /opt/frevos/repository/docker/oci/systemd/frevos-uat-backup.service /etc/systemd/system/frevos-uat-backup.service
   sudo install -o root -g root -m 0644 /opt/frevos/repository/docker/oci/systemd/frevos-uat-backup.timer /etc/systemd/system/frevos-uat-backup.timer
   sudo systemctl daemon-reload
   sudo systemctl enable --now frevos-uat-backup.timer
   sudo systemctl list-timers frevos-uat-backup.timer
   ```

2. Run and observe one validated logical backup:

   ```sh
   sudo sh /opt/frevos/repository/scripts/oci-uat.sh backup
   ```

3. Configure no more than five OCI block-volume backups and reconfirm the cost
   estimate is zero. Record only backup identifiers, times, and completion
   status—not data or credentials.
4. Exercise the isolated logical restore:

   ```sh
   sudo sh /opt/frevos/repository/scripts/oci-uat.sh restore-check
   ```

   The command accepts no arbitrary database name or file path. It restores only
   the latest controlled archive to `frevos_restore_check`, validates required
   relations, and removes the temporary database. It never replaces the active
   database. A destructive active-database restore is outside this runbook.
5. Monitor `/srv/frevos` capacity and approve a retention policy before deleting
   any backup. This initial package intentionally does not delete archives.

## 8. Independent acceptance boundary

Product-facing Playwright acceptance belongs in
`mishrarishav/FrevOS-Acceptance`; this repository must not weaken or edit those
tests to obtain a pass. A separate reviewed change must pin the exact deployed
FrevOS SHA and target only this HTTPS UAT origin. Synthetic Auth0 credentials
must stay inside the acceptance runner's approved secret boundary and out of
reports, screenshots, video, traces, and console output.

At minimum the independently reviewed suite must visibly cover desktop and
mobile unauthenticated state, successful authentication, empty membership,
authorized workspace rendering, logout/session expiry, permission denial,
responsive behavior, accessibility, console errors, and network failure. It
must retain protections against skipped, focused, weakened, or Production-bound
tests.

Phase 4 remains incomplete until that suite passes against this exact deployed
source and the deployment, recovery, cost, and acceptance evidence is reviewed.

## Rollback and failure handling

If migration, role verification, OIDC discovery, HTTPS, health, backup, restore,
or acceptance fails, stop and preserve the last known evidence. Do not weaken
RLS, expose PostgreSQL or SSH, use the migration credential at runtime, disable
certificate verification, consume paid resources, bypass CI, point acceptance
at Production, or change independent tests merely to obtain a pass.

Secret rotation, active-database restoration, volume formatting, resource
deletion, and Production deployment each require separate explicit approval.
