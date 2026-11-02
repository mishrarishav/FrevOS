# ADR 0083: Bound configurable provider waits and exercise production pairing cadence

Status: Accepted within the owner's existing test-failure repair and immediate
Server20 release request, 2026-11-02. Supplements ADRs 0081 and 0082; no new live
service enrollment, credential or activation is included.

Frozen aca3aa6 passes GitHub CI, but three full native attempts do not qualify
the release. They report respectively an installer approval-poll fixture
failure, a native Git fixture failure, and both failures. Each unchanged
targeted fixture passes separately. The last native Git error is
native-create:repository-provider-unavailable. Failed results are retained;
none is relabeled as a passing release build.

A separate real pairing diagnostic reproduces the accelerated 10ms fixture
exhausting the server's 40-per-minute limit before a delayed approval. The same
approval with production's default two-second polling connects. Remove only
that override from the original positive fixture so it exercises actual
production cadence. Preserve its assertions, five-second waits, security
coverage and the independent rate-limit test. No production polling or server
limit changes, external acceptance-test edits, skipped cases or threshold
reductions are authorized.

The Git transport currently has a fixed fifteen-second socket wait. Its generic
unavailable code does not prove the earlier failure was a timeout. A separate
successful native trace measures repository creation responses at 1.9–3.3
seconds; the preceding diagnostic also fails at the raw fixture setup boundary.
Do not claim either measurement proves the full-run failure's cause.

Make requestTimeoutSeconds an operator connection setting, integer 1–60,
default 15 for existing connections. Bound the entire network exchange as well
as socket inactivity, classify expiry as repository-provider-timeout / 504,
and preserve private-address pinning, response limits, actor/workspace/provider
identity, durable intent and reconciliation. Never automatically retry an
ambiguous mutation. New regression cases check invalid budgets, a chosen
successful wait, an unavailable service, streaming expiry and one-write-only
reconciliation.

The isolated Windows native-engine qualification profile explicitly selects
60 seconds for both raw setup and application API calls; Linux retains 15.
The outer 180-second native test, all Git/PR/RBAC/encrypted-recovery assertions
and coverage/audit gates remain. This is a documented slower provider profile,
not proof that old fifteen-second behavior is reliable on this host. The new
frozen source must pass complete native CI before packaging. Existing live
hosting settings, eight pairings, environment, data and keys remain protected;
exact artifact approval is still required before Production Apply.
