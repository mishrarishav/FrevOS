# Public gateway TLS-chain repair

2026-11-04. Scope: the owner's explicit request to repair the TLS chain for the
existing public DevSetu entry. Server9 remains a routing gateway; no application,
database, pairing, environment, private key or trusted-root migration is performed.

## Observed state and completed repair

Before repair, the public endpoint and the direct Server9 endpoint both fail a
fresh Node HTTPS request with `UNABLE_TO_VERIFY_LEAF_SIGNATURE`. OpenSSL's strict
verification and wire-chain capture show only the leaf certificate. Windows
clients can complete the missing issuer path themselves; this does not establish
a complete server handshake chain for other clients.

Server9 `LocalMachine\CA` was missing the exact issuing intermediate. The
existing public-only bundle, previously obtained from a successfully validated
Windows connection, contains:

- Intermediate: GoGetSSL RSA DV SSL CA 2,
  thumbprint `3F3C45BB6A48088EB1D3B4EC366D9841AFFFCC38`,
  SHA256 `b5286796dadf16521de41772ab2fdb5818729971b5274721146c6e8172befe07`.
- Existing trusted root: Sectigo Public Server Authentication Root R46,
  thumbprint `AD98F9F3E47D753B65D482B3A45217BB6EF5E438`.

Node's `X509Certificate` verifies the intermediate's signature against that root,
CA flag, issuer and validity. Only the missing public intermediate is imported to
Server9 `LocalMachine\CA`. Fresh `X509Store` reads verify the exact CA-store delta.
The root store is unchanged. No certificate private key is exported or copied.

The existing leaf remains
`5DEFDEB4313ECD79D3B94A5555635A963584D3BA`, SHA256
`d33b75a5daf9c48bed45a88f8ea40bf5041063fa74279611f5aef5150caae90b`.
Its private-key association remains present.

## Bounded refreshes and preservation

An exact hostname-specific HTTP.sys SNI record is queried and reapplied through
the atomic `HttpUpdateServiceConfiguration` API. The native buffer retains every
queried certificate option; no delete/add gap is introduced. All seven bindings,
including extended properties, compare identically after canonical sorting.
Windows moves the refreshed record in enumeration order; a raw-text comparison
initially reports that ordering difference. The separate preservation receipt
records this accurately and does not turn it into successful TLS acceptance.

The supported `certutil -flushCache` command invalidates only selected
certificate caches in the existing LSASS process: mask `0x30`, followed once by
mask `0x04`. These affect shared LSASS certificate caches and are not exclusive to
DevSetu. No registry, revocation policy, trust policy, OCSP policy, service or
application restart is changed. These commands return success, but they do not
resolve the observed leaf-only handshake.

Preserved values:

- IIS SHA256:
  `25652aa8088b9e40d0ae83d78e6c96dd3657f23d6830e8eefd46a12830e5ad7d`.
- Canonical complete binding records, including extended properties (JSON-array
  encoding in the first preservation proof):
  `363c5a446e44902e0bcc03045a5466ab138abcfd485cbe4ea8863994622afcb5`.
- Root store, leaf/private-key association and all sibling binding options.

An implementation mistake initially selects the `X509Store(string, ...)`
constructor with the literal name `CertificateAuthority`, which denotes a custom
logical store rather than the real `CA` store. Fresh reads of that same custom
store misleadingly pass. The unchanged actual machine path remains partial and
reveals the error. Only the mistakenly imported exact public certificate is
removed from that custom store; no store registration or other values are
deleted. The helper now uses explicit `StoreName.CertificateAuthority` and
`StoreLocation.LocalMachine` enums. The actual certificate provider's `CA` path
then confirms the intermediate, and a fresh machine-context issuer-path
inspection builds all three expected certificates. Its diagnostic excludes
revocation inspection in memory only; no runtime/global validation policy is
changed. The earlier incorrect and recovered attempts remain in evidence.

The same-record binding and bounded cache refresh attempts above occurred before
this constructor correction; they did not yet have the issuer in the real CA
store. Their unsuccessful TLS outcome is retained.

After the real CA import, one supported LSASS-only cache refresh with mask `0x34`
also preserves all configuration but does not release the held server credential.
The owner's authorized repair then recycles only the exact hostname-specific
`tserver2.eeslindia.org:443` HTTP.sys mapping. The complete native base record and
all extended properties are retained in memory; opaque/non-empty unsupported
properties would stop this operation before mutation. The native remove/add is
followed immediately by the same record, with bounded recovery on failure. The
observed gap is 16 milliseconds. No IIS site, application or service is restarted.
All seven bindings and their extended properties compare identically afterwards.
The final canonical binding digest (sorted blocks joined with separators) is
`31fa7b49fba92dd7baf9f5655c4181b4f8ca5d6f6f0000bace9c68a54fe54957`.

The target's extended settings remain receive window 1,048,576; maximum settings
per frame 2,796,202 and per minute 4,294,967,295. Extended properties 2–4 remain
empty and property 5 is absent. No TLS session-ticket keys are exported.

## Acceptance status

**PASS: strict public TLS acceptance.** At 2026-11-04T05:20:09Z, fresh default
Node v24.19.0 HTTPS requests to both `tserver2.eeslindia.org` and `10.9.69.9` with
the correct SNI validate the expected chain, negotiate TLS 1.3 and return health
200. No custom CA, insecure mode, disabled verification or client-policy
workaround is used. The standard Node trust bundle already includes the expected
R46 root; it is not added to the client.

Independent OpenSSL strict verification returns exit 0, `Verification: OK` and
`Verify return code: 0 (ok)`. Its wire capture now contains two certificates:
the original leaf and correct GoGetSSL intermediate. The trusted root is supplied
by the client trust store, rather than requiring the server to send it. No global
IIS reset, server restart, binding-certificate rotation or root-policy change is
performed.

Existing public alternate HTTPS ports 8443 and 9443 time out and have no Server9
listener. This does not establish whether a newly configured port would traverse
the upstream firewall/NAT. No listener, firewall or NAT is changed.

## Evidence and recovery

Ignored operator evidence is under `.local/`:

- `public-gateway-tls-chain-plan.json`,
  `public-gateway-tls-chain-repair.json`,
  `public-gateway-tls-chain-attempt-recovered.json`,
  `public-gateway-tls-chain-wrong-store-attempt.json`,
  `public-gateway-tls-custom-store-recovery.json`.
- `public-gateway-tls-wire-before-refresh.txt`.
- `public-gateway-tls-binding-plan-before-refresh.json`,
  `public-gateway-tls-binding-preservation.json`.
- `public-gateway-tls-cache-refresh.json`,
  `public-gateway-tls-machine-chain-refresh.json`,
  `public-gateway-tls-corrected-cache-refresh.json`.
- `public-gateway-tls-binding-recycle-plan.json`,
  `public-gateway-tls-binding-recycle-refresh.json`.
- `public-gateway-tls-strict-node.json`,
  `public-gateway-tls-wire-after-repair.txt`.
- `public-gateway-tls-machine-path-corrected.json`.

If the CA import must be reversed, first verify the retained before/after store
and IIS/binding evidence, then remove only the imported certificate from
`LocalMachine\CA` by its exact thumbprint. Keep the existing root and leaf stores.
The store-removal boundary is a fresh read/write `X509Store` constructed with
explicit enum `StoreName.CertificateAuthority` and enum
`StoreLocation.LocalMachine` (actual store name `CA`), removing only
`3F3C45BB6A48088EB1D3B4EC366D9841AFFFCC38`. The original absence of that certificate
is recorded. Cache invalidations have no persistent configuration to restore;
the same-record binding update and exact SNI recycle have no changed binding
values to restore. Reversal of the CA import would intentionally restore the
original incomplete-chain problem and is not required for application recovery.

Microsoft references:
[IIS intermediate certificate configuration](https://learn.microsoft.com/en-us/troubleshoot/developer/webapps/iis/www-authentication-authorization/configure-intermediate-certificates),
[atomic HTTP configuration update](https://learn.microsoft.com/en-us/windows/win32/api/http/nf-http-httpupdateserviceconfiguration),
[certutil selective process caches](https://learn.microsoft.com/en-us/windows-server/administration/windows-commands/certutil#-flushcache).
