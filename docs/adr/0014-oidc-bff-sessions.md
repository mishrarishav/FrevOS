# ADR 0014: Use OpenID Connect through a session-owning backend

- Status: Accepted
- Date: 2026-08-10

## Context

FrevOS is a browser-based business application that will handle source code,
approvals, release evidence, deployment authority, and later office data. A
browser-only OAuth client would expose access and refresh tokens to the same
JavaScript environment that processes untrusted content. FrevOS also needs a
provider-neutral identity boundary and must not use email addresses as durable
user identity.

OpenID Connect defines the issuer and subject pair as the stable identity key.
OAuth security guidance recommends Authorization Code with PKCE, exact redirect
matching, CSRF protection, and issuer validation. Current browser-application
guidance presents a Backend for Frontend as the strongest of the common
browser patterns because provider tokens remain on the server.

## Decision

- Use standards-compatible OpenID Connect through a FrevOS-owned confidential
  backend adapter. The production provider is deployment configuration, not a
  domain type.
- Use Authorization Code with PKCE `S256`, transaction-bound `state` and
  `nonce`, exact registered HTTPS redirect URIs, and strict issuer, audience,
  signature, expiration, and nonce validation.
- Map an external identity by the exact `(issuer, subject)` pair to an internal
  opaque `UserId`. Never use email, display name, or a mutable provider profile
  field as the identity key.
- Keep access, refresh, and ID tokens in the server-side session boundary.
  They must not be returned to browser JavaScript, stored in Web Storage, or
  exposed through domain contracts, logs, traces, or validation errors.
- Give the browser only an opaque, high-entropy session handle in a cookie named
  with a `__Host-` prefix and configured `Secure`, `HttpOnly`,
  `SameSite=Strict`, `Path=/`, and no `Domain` attribute.
- Default sessions to a 30-minute idle lifetime and a 12-hour absolute
  lifetime. Rotate the session identifier after authentication and any
  privilege-boundary change. A deployment may shorten these limits; increasing
  them requires security review.
- Protect state-changing BFF requests with a session-bound anti-CSRF token and
  same-origin checks. `SameSite` is defense in depth, not the only CSRF control.
- Reconstruct the user and current membership from server-side state on every
  protected request. A selected workspace in the browser is only a request
  parameter.
- Persist long-running task state independently from the login session so
  session expiry or browser disconnect does not terminate work.
- Require the eventual configured provider to support OIDC discovery,
  Authorization Code with PKCE, exact redirect registration, and the assurance
  and lifecycle controls documented for the deployment. Provider-specific SDK
  objects stay inside the adapter.

Phase 4A defines only token-free identity and session contracts. The protocol,
cookie, CSRF, persistence, and provider adapter are Phase 4B work.

## Consequences

- Browser compromise cannot directly read OAuth tokens, although it can still
  act through an active session and therefore still requires XSS and CSRF
  defenses.
- The control plane must operate a durable, revocable session store and proxy
  protected calls.
- Server-side membership changes take effect without trusting stale role or
  scope claims in the browser.
- Enterprise SSO, MFA enforcement, SCIM, recovery, and provider-specific
  organization features remain deployment requirements rather than domain
  assumptions.

## Rejected alternatives

- OAuth access or refresh tokens in `localStorage`, `sessionStorage`, or
  browser-readable cookies.
- The implicit grant or password grant.
- Treating the Vite client as a confidential OAuth client.
- Using an email address as a durable user key.
- Embedding one identity provider's SDK types in FrevOS contracts.
- Treating `SameSite` alone as sufficient CSRF protection.

## Evidence

- [OAuth 2.0 Security Best Current Practice](https://www.rfc-editor.org/rfc/rfc9700.html)
- [OAuth 2.0 for Browser-Based Applications](https://datatracker.ietf.org/doc/draft-ietf-oauth-browser-based-apps/26/)
- [OpenID Connect Core 1.0](https://openid.net/specs/openid-connect-core-1_0.html)

## Related records

- [ADR 0002](0002-workspace-isolation.md)
- [ADR 0010](0010-schema-first-domain-contracts.md)
- [Phase 4 foundation](../PHASE_4_FOUNDATION.md)
