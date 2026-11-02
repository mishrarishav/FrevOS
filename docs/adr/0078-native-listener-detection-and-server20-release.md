# ADR 0078: Native listener detection and Server20 release

Status: Accepted for the owner's explicit fix, Server20 deployment and GitHub
publication request, 2026-10-31. Phase 4 remains open.

Continue on codex/central-git-collaboration from e5b1122. Include its existing
ADR 0076/0077 implementation. Fix the two unchanged Windows local-development
failures, run required validation, publish the task branch to GitHub, and use
the configured DevSetu source/build/independent-destination deployment flow.
Preserve existing pairing, credentials, configuration, databases, monitoring
history, persistent files, uploads, attachments and sibling applications.
No default-branch push/self-merge, customer deployment, new engine enrollment,
permission grant or repository migration is included.

An actual loopback HTTP fixture returns 200, while both the CIM TCP provider and
netstat omit its listener. GetExtendedTcpTable reports the exact fixture PID.
Use that Windows IP Helper API for bounded IPv4/IPv6 listener-owner inventory.
Retain unique-owner requirements, CIM process identity/ancestry, PID reuse
protection and the immediate pre-termination recheck. Do not infer process
ownership from a reachable port or weaken the existing native tests.

Native API contract: https://learn.microsoft.com/en-us/windows/win32/api/iphlpapi/nf-iphlpapi-getextendedtcptable

The owner authorizes publication and same-scope Server20 platform activation;
the configured action still requires verified source/artifact identity, current
target, fresh backup, scoped single-use approval and durable audit evidence.
An unavailable VPN, session, validation gate or integrity check is a blocker,
not authority to bypass the configured deployment mechanism. No new live Git
engine/secret/role setup is inferred from platform deployment authorization.

This supersedes the earlier task-specific exclusion of platform publication
and deployment in ADR 0077. All other boundaries remain unchanged.
