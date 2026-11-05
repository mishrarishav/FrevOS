# ADR 0101: Initial software inventory and actionable explorer permissions

Status: Accepted for the owner's 2026-11-05 inventory/explorer correction and
DevSetu activation request. Builds on ADRs 0087, 0088 and 0099.

Live evidence distinguishes two failures. L-1770's legacy project connectors
report Discovery but have no software sidecars/capability. ESDS's new system
connector reports inventory consent but has no initial inventory. Its failed
file/folder requests target C:\Users and return folder-permission-denied from
Windows; the connector must retain the operating user's OS permissions.

Scope this task to an artifact-bound legacy project software-sidecar update,
initial consented inventory collection, honest software states, and actionable
explorer errors. A connector may ask for its own initial inventory only with
fresh authenticated inventory consent. Schedule the existing audited inventory
job, serialize per device, preserve successful snapshots, and bound retries.
Manual refresh remains available. No software installation permission is implied
by inventory collection; existing local consent and pairing must be retained.

Prefer a verified identity's explorer-capable connection when other live/owner
conditions are equal. Never authorize by computer name or display association.
Explain permission-denied creation without elevating privileges or changing
ACLs. Test a restricted temporary Windows folder and an ordinary writable folder;
do not write to C:\Users or alter existing customer projects.

Preserve pairing, retained configuration, environment, existing inventory and
project data. Build and review an immutable artifact, materialize the owner's
explicit task as a fresh actor/workspace/target/artifact-bound activation intent,
then activate through the real DevSetu UI. No GitHub/default-branch publication,
database migration, new grants, raw remote shell, DNS or firewall change is in
scope. ESDS live acceptance requires that device to report online; isolated
Windows simulation is recorded separately and must not be called live acceptance.
