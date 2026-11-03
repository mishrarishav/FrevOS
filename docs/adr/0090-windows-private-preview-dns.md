# ADR 0090: Windows private preview DNS classification

Status: Accepted implementation detail of the owner's software/VPN live-test task.
Extends ADRs 0075 and 0089. Phase 4 remains open.

The approved software-management release d0f03f5 is activated on Server20 through
DevSetu with manifest f8dd3726. Actual private-preview Plan rejects both the
existing short hostname and its FQDN: Windows resolves this computer's own name
to the private IPv4 address and a scoped IPv6 link-local address. The validator
reports preview-private-origin-required. No preview configuration is applied.

Recognize valid IPv6 link-local literals in fe80::/10, including Windows scope
identifiers, using Node's complete IP parser before checking the range. Retain
the existing IPv4/loopback rules and reject malformed or public IPv6 addresses.
Every DNS answer must still qualify; one public answer denies the origin.
No new DNS record, firewall rule, permission grant or general TCP tunnel is added.

In scope: this bounded classifier fix, actual observed DNS regression, malformed
and mixed-public-answer denial, a new immutable native artifact and separate
exact-artifact Production approval before activation. The already activated
artifact is not edited in place. Existing pairing, settings, projects and Android
signing identity remain protected. No GitHub publication or self-merge.

Live qualification still requires the L-1465 local software permissions and
actual inventory/demo request-response verification from L-1770.
