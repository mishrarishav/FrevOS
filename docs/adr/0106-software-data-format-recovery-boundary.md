# ADR 0106: Software data-format and recovery boundary

Status: Accepted as the compatibility correction to ADR0102/0103, 2026-11-06.
Local implementation only; final operator enrollment/deployment remains with
the owner. Earlier accepted decisions remain historical records.

The former software reader accepts only inventory/install/stop-demo jobs and
strict desktop observations. New service jobs, service-management observations
and Android package inventories cannot be read by that version. They share a
retained software state directory; reverting application code alone is therefore
not necessarily a compatible recovery. Android/preview filename-presence checks
do not establish this data compatibility.

Generate canonical `deployment/server20/software-data-format.json` from positive
qualification of the actual packaged contract schemas. It records reader level2
and the SHA256 of the packaged software contract module. Bind metadata and module
bytes into the immutable release manifest. The native guard verifies canonical
metadata, its manifest digest and its exact module digest. A filename alone is
not a declaration of software capability. Legacy artifacts without metadata are
reader level1.

Before durably writing any new observation/snapshot/policy/service job or Android
inventory, atomically persist a monotonic level2 marker in the existing protected
software state root (`servix/jobs/software/data-format.json`). Never lower it or
delete retained jobs to force a downgrade. Invalid or unsupported markers fail
closed. A new application that fails before any level2 write has no new floor:
ordinary level1 recovery is still permitted. Once level2 state is written, only a
reader at least that level may start against it.

Check the floor during native planning and again after the control-plane task
has stopped, before changing the active release. The automatic health-failure
recovery path applies the same post-stop check before restoring the previous
pointer. If new state makes that previous reader incompatible, retain the data,
receipts and stopped candidate for a compatible recovery release; do not restart
an incompatible parser or roll back application data automatically.

The owner must review and update the enrolled builder and destination operators
before activation. The existing fixed sidecar-update procedure may carry the
reviewed Apply-ServixDashboard and ComponentPlatform scripts in addition to its
existing HttpCommon and compatibility guard. The native adapter/configuration,
task identity, scope, ACLs and approval checks remain enforced. Staged Apply jobs
must carry the reviewed HttpCommon helper; component staging copies it explicitly.
No live operator/configuration/enrollment update is performed by this local work.

Local tests cover actual schema qualification, real durable store format floors,
legacy pre-write recovery, rejection after level2 writes, compatible recovery,
canonical/schema tampering and malformed markers. Native guard/recovery helpers
run against isolated filesystem fixtures; no real task activation or rollback is
claimed by those tests. Full immutable signed release gates remain required.
