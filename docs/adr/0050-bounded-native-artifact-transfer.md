# ADR 0050: Bounded native artifact transfer

Status: Accepted for the owner-requested development pilot, 2026-10-22.

The verified native bootstrap ZIP is 78,185,461 bytes. Do not make native
self-deployment depend on a large HTTP request or silently change shared IIS
request limits. Extend ADR [0049](0049-configured-component-deployments.md) with
an explicitly enrolled native artifact directory: an authenticated UNC directory
on the builder and its corresponding local directory on the destination. This
is configuration of the selected server20 compatibility adapter, not authority
to access another server, customer root or Production environment.

The builder verifies and copies the immutable baseline locally, performs frozen
installation and full CI in the isolated source checkout, and builds the bounded
native release. It publishes the ZIP once under its SHA-256 filename with
exclusive creation and verifies the resulting bytes. The control plane receives
a small immutable reference containing only ZIP digest/size, manifest digest and
source commit. A reference contains no arbitrary path, command or credential.

The independent destination resolves that digest beneath its locally enrolled
directory, rejects linked paths, checks size and ZIP hash, then checks the exact
manifest and source commit at the existing native activation boundary. The
artifact-bound approval and receipt retain the actual ZIP and manifest digests.
Rollback resolves the same saved reference and restores the same ZIP bytes;
it never rebuilds an earlier source revision. References and native archives
have distinct digests and must not be confused in reports.

The artifact directory is private and persists across deployment/rollback.
Credentials remain opaque references or DPAPI-protected local enrollment data.
There is no new browser shell, public artifact share, database migration,
Production deployment, worker sandbox or general artifact-store service.
Generic component HTTP transport remains separate; large generic artifacts and
other runtime/platform adapters need their own configured transport validation.
