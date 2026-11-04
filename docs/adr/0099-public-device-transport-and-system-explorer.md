# ADR 0099: Public device transport and connected-system Explorer

Date: 2026-11-04

Status: Accepted owner scope; implementation and live acceptance pending.

The owner extends ADR 0098: repair the actual public TLS certificate chain and
support paired connectors, registered-device sign-in and laptop previews from
the configured public DevSetu entry without requiring Fortinet. Server9 remains
a routing gateway; application, identity, data and workers remain on Server20.
Do not disable certificate validation or registered-device proof. Endpoint base
paths, allowed origins and preview origins must be explicit configuration. An
arbitrary laptop application must not share the authentication hostname. Although
a separate port changes the browser origin, cookies are not port-scoped, so that
alone is insufficient. Retain hostname isolation and validate public DNS,
certificate and reachability before reporting public preview support.

The owner subsequently declines a new DNS name and retains the existing public
IP and `/devsetu/` URL. Therefore provide bounded API request/response inspection
inside DevSetu, with response bodies rendered as inert text/JSON. Do not execute
proxied HTML, JavaScript or active documents on the authentication hostname.
The existing full-application private preview remains available through its
separate hostname; public raw-application preview is deferred until an isolated
hostname is configured. No DNS/new public preview port is in this operation.

The owner also requests a consistent Discovery interface and an Explorer-like
browser on the selected connected computer. List folder and file metadata,
including archives, with navigation, location and bounded pagination. Support
new folders and new files with exclusive creation; preserve existing files and
reject traversal, links and protected connector/credential locations. Reuse
workspace and device authorization and audit typed operations. Negotiate new
connector capabilities rather than sending unfamiliar writes to old clients.
This does not authorize deletion, overwrite, arbitrary remote shell or executing
files selected in the browser.

System health describes the physical computer. Existing project connections are
retained, but their technical profile names must not masquerade as the computer's
identity. Show project bindings separately from the machine overview. Give
temporary/cache/tooling activity a clear separate view and bounded independent
retention; path classification is configurable and does not measure productivity.
Browser-generated profile/cache paths should be classified as temporary activity
without excluding unrelated source files under an artifacts directory.

Fix the public-entry notice's workspace layout and apply shared form/dialog
styling to Discovery rather than leaving raw controls. Validate private and public
entry layouts, narrow viewports, authorization, old connector compatibility,
creation conflicts and retention. Preserve existing pairings, settings, data,
environment, signing identity and sibling IIS applications. Snapshot before
external changes and verify actual artifact activation and live transport
separately from local tests. Existing owner authorization covers this scope;
do not invent a new artifact-specific reply or repeat old approval questions.
