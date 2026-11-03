# ADR 0093: Preserve the relay's unauthenticated response through IIS

Status: Scoped preparation following the recovered ADR 0092 activation attempt.
Supersedes the operator's incorrect HTTP 403 health expectation, not the existing
relay authorization contract. A revised exact operator review is required.

The owner approved payload 998da601 / operator cf959bd for correlation
pvi_9c69d6a9fbc34c62a18a8d5dd17d463a. Apply reached its unauthenticated routing
health assertion and failed at line 81. Its receipt reports IIS and relay changed,
then recovery PASS. The original applicationHost.config and relay SHA256 match
their preimages. Eight pairings, five settings and five software records verify.
The owned empty physical folder is removed after checking it is not linked and
contains no files. The consumed approval cannot authorize a second attempt.

Source inspection and the actual existing relay authentication test show that
an exact Host without a lease/cookie returns HTTP 401 with the fixed body
`preview-open-from-devsetu`; 403 is used for denied hosts/origins. The original
operator assertion was wrong and did not record the actual response status.
Do not claim a specific observed first-response code from that incomplete receipt.

Require the correct 401 and exact bounded fixed denial body, so an unrelated
401 page or host-denied 403 cannot pass. Preserve upstream error response bodies
through the new site's scoped `httpErrors existingResponse="PassThrough"` setting;
global error/proxy settings are unchanged. This supports application API error
responses as well as the preview authentication response. Record numeric HTTP
status in any subsequent failure receipt, without arbitrary response bodies.
Remove the new physical folder on owned-change recovery only when empty.

This is an operator/configuration repair, not a change to authentication policy,
the active app artifact, permissions, network rules or customer applications.
Repeat local checks and mapped IIS creation/recovery, freeze the revised source,
then show the new exact payload and obtain a fresh single-use activation decision.

The [Microsoft IIS error-response documentation](https://learn.microsoft.com/en-us/iis/configuration/system.webserver/httperrors/)
defines PassThrough as retaining an existing response. The actual relay source
and existing authentication test remain the authority for the expected denial.
