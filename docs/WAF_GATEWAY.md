# Configurable local WAF gateway

ADR0105 adds a Coraza/Caddy + OWASP CRS sidecar. It owns no application,
pairing, database or environment volume. No live route changes in this task.

## Source and dependency review

Inspected the [official image source](https://github.com/coreruleset/coraza-crs-docker)
at `f77d402f70b6b3c82ad28121d488af97293e8880`: Dockerfile, entrypoint, templates
and rule loading. Image digest:
`8873f6a5042dad27dde7cfc07f6a47d3871cac01f719324d4c24bdabc4a0e07a`.
Actual binary build information reports Caddy 2.11.6, coraza-caddy 2.6.2, Coraza
3.8.1 and embedded CRS **4.25.0**. The configuration uses embedded rules, not
the different filesystem CRS versions in upstream Docker build defaults.

The image identifies its license as Apache-2.0. Integration follows the
[official module](https://github.com/corazawaf/coraza-caddy). This is source and
execution-path analysis, not an exhaustive reverse-engineering or security-audit
claim. No downloaded repository script gains access to application storage.

## Local operation

With the existing Docker preview running:

```sh
pnpm local:waf up
pnpm local:waf status
pnpm test:waf
pnpm local:waf down
```

First use creates `.local/waf.env` from `deployment/waf/waf.env.example`; existing
configuration is retained. Edit it and run `up` again. `validate` checks settings
without starting containers. Defaults: `http://127.0.0.1:8380`, DetectionOnly,
upstream `http://frevos:10000`, existing `frevos-local_default` network. This HTTP
diagnostic entry does not replace the configured HTTPS/OIDC browser origin.

Image digest, network, bind address, port, upstream, application prefix, mode,
paranoia, score, body limits and trusted proxies are validated configuration.
On enforces blocking; DetectionOnly allows suspicious traffic while legitimate
traffic is reviewed. Off is an explicit setting. Raw engine logs remain disabled
in every mode. WAF supplements existing application authentication/authorization.

## Transport and storage boundaries

Preserve paths, Host, Origin and cookies. Response inspection is off; Caddy
preserves standard WebSocket upgrades and streaming. Application preview-relay
restrictions remain effective; proxy tests do not add relay streaming support.

Defaults allow 32 MiB inspected non-file bodies, 64 MiB inspected total bodies and
a 512 MiB transport ceiling. These cover software observations (3 MB), preview
completion (23 MB JSON), Git (64 MiB) and artifact transports (512 MiB). Backend
authentication, integrity and smaller per-route limits remain effective.

Only exact POST binary routes and MIME types skip text-body inspection and CRS
MIME rule 920420: executor artifact, Git desktop publish, source seed and source
bundle. URI/header/query rules remain active. Wrong path, method, MIME or prefix
does not receive the exemption. WAF does not authenticate an exempt request.

Trust only configured immediate gateway CIDRs. Public browser-entry routing must
retain its existing local IIS hop, origin and prefix identity; a remote container
cannot directly replace a loopback-restricted listener. No TLS bypass, public
exposure, DNS or firewall change occurs.

The non-root container has a read-only root, bounded tmpfs/resources, no app
volumes and no-new-privileges. Only NET_BIND_SERVICE is retained because the
reviewed binary has that file capability; other capabilities are dropped.
Operational logs omit requests and response headers and rotate at 3 × 5 MB.
Raw bodies, cookies, source, queries and engine matched values are not logged.
HTTP 403 counts are outcomes, not proven attack counts.

## Evidence and deployment

Actual pinned-engine Docker smoke passes 19 checks: On SQLi/XSS blocking against
an upstream which otherwise accepts them; Hindi JSON, origin/host/cookies,
upload/download bytes, WebSocket/direct-proxy SSE, exact binary exemptions,
wrong-route/MIME/method handling, retained query checks, transport ceilings and
fake-private-canary absence from logs. Both On and DetectionOnly are exercised.
Fixtures/network are removed, preserving the existing local preview containers.
Evidence: ignored `.local/waf-smoke-result.json`. The actual local DevSetu health
endpoint also returns 200 through the sidecar.

These synthetic checks do not establish production login, connector, public TLS
or false-positive acceptance. App and WAF are separate artifacts. An enrolled
WAF component must include `compose.waf.yaml`, configuration and the pinned image
on a compatible Linux-container host. Windows development uses Docker's Linux
engine; native support on existing Windows Server 2016 is not established.
Ordinary application deployment updates Server20 and its existing T-Server proxy
entry; it does not install this WAF on T-Server. Final live deployment is owner
operated under ADR0104.
