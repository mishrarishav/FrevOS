# ADR 0107: Configurable application review registers

Status: Accepted for local implementation and testing, 2026-11-10.

The owner requests application reviews inside the existing Reviews menu, with
configurable register names, fields, choices and access. The supplied Excel is
import input, not source code or executable configuration. Existing Discovery
record workspaces and dialogs define the visual contract: persistent actions,
Card/Table views, bounded scrolling, scoped preferences and responsive filters.

Each workspace owns separate registers, records, grants, provenance, dated
assignment changes, reviews and link-check history. Business owner, SPOC and
technical maintainer remain distinct. Employment status is never inferred from
an empty cell, formatting, a discontinued application or conflicting worksheets.
Administrators configure registers and grants; reviewers edit and test; viewers
read only. Every operation refreshes workspace membership and register access.
Administrator status comes from explicit scopes or operator-owned configuration,
never a browser role label or general project-write permission.

Excel import has a bounded, inert XLSX reader, column mapping, source references
and an expiring, revision-bound preview. Duplicate endpoints and conflicting
records require an explicit per-row resolution. Import does not execute formulas,
follow hyperlinks or send messages. Source workbook bytes are preserved.

Link checks are bounded server-side GETs from the configured server network.
Only administrator-configured origins and paths are eligible; DNS answers and
redirect targets are checked before connection. No DevSetu cookies, credentials,
arbitrary headers, scripts or remote markup are forwarded/executed. HTTP status,
authentication, transport, redirects and semantic page evidence remain separate.
HTTP 200 alone does not establish that the expected application works. Internal
targets require explicit private-network allowance and a reachable server route.
This phase does not add a paired-laptop checker, browser automation credentials,
e-office drafting, mail sending or automatic employment decisions.

State is stored under a configurable dedicated review root, using atomic durable
records. No existing pairing, software inventory, settings or environment state
is rewritten. New state must be included in the owner's backup configuration.
This change is stacked on the owner's existing local Apps/Services/WAF work at
6addf9b4f86d6052cd89b5511bb0b28191a556cb, in a dedicated branch. Publication and
Server20/T-Server activation remain owner-operated under ADR0104. This phase
ends with local tests/build/browser evidence, not a live deployment.

2026-11-10 follow-up: The owner additionally authorizes actual checks of the
imported links and explicit allowed-origin configuration in the local instance.
Optional per-check anonymous application cookies are off by default and never
share portal/browser sessions. They are limited to the initial exact origin and
discarded after a bounded check. Protocol-unspecified source URLs may have
separate explicit HTTP/HTTPS endpoints, never a silent HTTPS downgrade. Bounded
response prefixes retain observed HTTP status without establishing health from
partial content. Browser evidence uses configured fields, distinct from measured
server checks. Origin capacity is bounded at 128 exact origins. This follow-up
does not authorize production activation or application sign-in/transactions.
