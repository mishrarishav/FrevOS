# ADR 0108: Scheduled Reviews and certificate alerts

Status: Accepted for local implementation and testing, 2026-11-11 IST.

The owner extends ADR0107 with configurable weekly testing inside Reviews,
dashboard reports and advance SSL expiry notifications. Final deployment remains
owner-operated under ADR0104. This is deterministic application monitoring in the
existing local Reviews branch, not a general autonomous agent or Codex reminder.

An administrator explicitly selects weekdays, local time, an IANA timezone,
the exact recorded-access values that mean Accessible for this register, and
expiry warning thresholds such as 15 and 10 days. Inaccessible/unselected values
are skipped. A previously failing measurement never silently removes an eligible
application from future checks: eligibility comes from the configured business
classification, not the latest network outcome. Schedules start disabled and
importing a workbook never grants network access or enables recurring traffic.

The control-plane worker retains bounded durable run reports in the review root.
It claims occurrences and attempts before issuing bounded read-only requests,
prevents overlapping work, checks current workspace/admin authority and endpoint
policy, and records interrupted outcomes truthfully after a restart. Catch-up is
bounded and reports actual measurement time; it does not backfill historical
health. The existing single-writer review-root constraint remains in force.

TLS observations describe certificate identity, issuer, validity dates and
verification status separately from HTTP/page health, including HTTPS redirect
hops. Certificate verification and existing DNS/origin/path restrictions remain
enabled. Failed TLS may expose no usable certificate metadata; the report must
say so rather than retrying insecurely. No raw certificates/private keys, portal
cookies, app credentials or response HTML are retained as report content.

Expiry reminders can be re-evaluated between weekly checks using the last
observed verified certificate. They carry its observation time and do not claim
that an uncontacted site still serves that certificate. Renewal resolves obsolete
alerts after fresh evidence. Stable certificate/threshold identities prevent
repeated alerts for the same observation, and read receipts belong to each user.

Reports and alerts are filtered by verified workspace membership and register
access. They are shown in Reviews, the Control Center and the existing bell;
general users do not need join-request administrator privileges to see their own
permitted alerts. Configuration/manual monitor runs remain administrator-only.
No external email, desktop notice, service command, deployment, employee-status
decision or project-completion inference is added by this change.
