# ADR 0095: Preserve the browser Origin for preview bootstrap

Date: 2026-11-03

Status: Implemented and locally qualified; immutable release preparation pending.

## Context

The owner-approved packaging repair is active as source 812501d / manifest
b8aed7d6. The actual L-1770 browser now submits the preview form, but the relay
rejects its bootstrap. The portal sends no-referrer, which causes a null Origin
on the cross-origin form POST. This differs from CORS fetch behavior and was
missed by the injected HTTP policy test.

A loopback-only browser diagnostic reproduces null Origin with the observed live
policy. Under strict-origin the same asynchronous popup/form flow sends the
exact portal Origin, establishes an HttpOnly/SameSite=Strict fixture cookie,
and completes real DemoApi GET and POST with an echoed nonce. All data is local
synthetic fixture data; this does not establish L-1465 acceptance. The live
preview lease is closed and only the owned demo is stopped.

## Decision

When validated preview origins are configured, emit Referrer-Policy strict-origin
alongside the existing restrictive CSP. It sends only an origin, omits path/query,
and suppresses HTTPS-to-HTTP downgrade referrers. Otherwise retain no-referrer.
Do not change the relay's exact Host/Origin, ticket, cookie, lease, authorization
or session checks. Do not accept null Origin or patch an active sealed artifact.

Extend source and actual packaged-runtime checks to require strict-origin with
preview enabled and no-referrer otherwise. Qualify the browser bootstrap and
GET/POST before preparing a new immutable release; preserve existing identity,
pairing, data, settings, environment, installers and isolated IIS configuration.
Use the actual maintenance UI for activation and record any remaining acceptance.

## Observed local qualification

Twenty-five Control Center/preview relay tests pass. A second isolated real
browser exercise loads the freshly compiled Control Center and PreviewRelay,
uses a synthetic connector store plus the actual connector HTTP forwarder and
DemoApi, and completes popup form bootstrap, HttpOnly/SameSite cookie, GET and
POST with an echoed nonce. It uses only owned loopback services and temporary
fixture storage, without production credentials, projects or pairings. The
actual L-1770 to L-1465 browser test remains pending the corrected live artifact.

## References

- [MDN Referrer-Policy](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Referrer-Policy)
- [MDN Origin](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Origin)
- [Fetch specification](https://fetch.spec.whatwg.org/)
