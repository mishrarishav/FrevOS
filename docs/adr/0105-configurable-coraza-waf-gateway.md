# ADR 0105: Configurable Coraza WAF gateway

Status: Accepted for the owner's 2026-11-06 WAF clarification. Local implementation
and isolated testing only; no public gateway activation is authorized in this task.

Use the maintained Coraza/Caddy integration and OWASP Core Rule Set through an
immutable OCI digest. Inspect upstream source and actual compiled dependencies;
do not reimplement generic attack detection using application regexes. Source
analysis is not a claim of exhaustive reverse engineering or a vulnerability audit.

Provide an independently configurable WAF sidecar. Keep app storage, pairing,
credentials, environment and databases outside it. Bind the example listener to
loopback and join only the configured backend network. Preserve path, Host, Origin,
cookies and supported protocol upgrades. Trust only configured immediate proxies.
Do not weaken TLS validation or use broad trusted-private-network defaults.

Default to DetectionOnly while legitimate application traffic is reviewed; On and
Off are explicit configuration choices. Keep paranoia, thresholds, prefix and
body limits configurable and validated. Narrow binary business-route exclusions
disable only payload text inspection and the corresponding CRS MIME rule; they do
not disable URI/header rules or backend authentication, authorization, integrity
and size limits. Response bodies are not buffered or inspected.

Do not log raw requests, headers, cookies, source content or engine matched values.
Keep bounded operational access summaries with request/response-header fields
removed. A 403 count is an HTTP outcome, not a proven attack count. The loopback
readiness listener validates process/config loading and never proxies application
requests around inspection.

Exercise the actual pinned engine locally against disposable fixtures: normal
traffic, SQL injection/XSS, mode changes, upload/download bytes, cookies, origin,
prefix, WebSocket, size limits and secret-canary non-disclosure. These tests do not
establish public TLS, production false-positive tuning or Android/remote-preview
acceptance. WAF does not create OS or endpoint-management authority.
