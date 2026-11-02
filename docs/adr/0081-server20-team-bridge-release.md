# ADR 0081: Prepare the Server20 read-only team release

Status: Accepted for the owner's explicit deployment follow-up, 2026-11-02.

The owner approves publication of ADR 0080's reviewed patch and then requests
the new DevSetu changes on Server20 immediately, correcting the earlier
tomorrow/Server25 wording. No future automation is created. Publication uses
task branch `codex/paperclip-agent-bridge`, implementation `26664d5`, draft PR
43 targeting canonical main. PR 42 remains an unmerged prerequisite; no agent
merge or general roadmap phase completion is authorized.

Prepare a new immutable release through the existing enrolled native builder
and Server20 Android SDK. The fresh target baseline is manifest
`b0c300090e9423d4583dd5a386460b2bf5f1b9136bc6c8dd650331a7a3e5d24d`,
source `074b9e5`, eight pairings and five stable configuration files.
Preserve their identities/credentials, environments, databases, uploads,
attachments, signing certificate and all protected paths. Use short private
staging under the already enrolled output root to avoid the previous real
PowerShell path-length failure; do not relax any check.

Release preflight finds that the sealed packager's explicit module copy lists
need `paperclip-bridge` and `agent-teams`. Add those modules and all three new
source inputs (including AgentTeamsPanel) to provenance. Refresh only the
existing builder's allowlisted packaging sidecars through the bounded updater,
with exact preimages, actor/target/digests/expiry, preserved enrollment/native
adapter/task/ACL and idle-work checks. No builder secret or privilege change
is included. Actual package dependency closure and source inventory must verify.

The deployed API lacks build-only, so preparation uses the same enrolled
native build boundary as ADR 0079; do not call a deploy queue that would apply
before exact artifact review, or claim a control-plane build-only run.
After preparation, present exact source/manifest/archive and current target,
backup, protection and expected interruption. Production apply still requires
fresh single-use actor/workspace/action/target/correlation/artifact-bound
human approval through the independent updater. The owner's broad deployment
intent is not an approval record for an as-yet unknown artifact.

This release enables DevSetu's read-only team UI/runtime. A permanent Paperclip
service, its hosting, company-scoped identity/secret and live multi-user RBAC
remain a separate enrollment decision; the optional backend stays disabled
until enrolled. Do not turn the disposable synthetic instance into Production.
