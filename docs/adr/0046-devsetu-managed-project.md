# ADR 0046: DevSetu managed project

Status: Accepted for the owner-requested server20 pilot, 2026-10-22.

The owner expects DevSetu alongside Servix in Projects and Deployments. ADR 0045
implemented its independent platform updater but exposed it only through a header
link. Add a built-in, read-only `devsetu-platform` project using the existing
settings contract with a distinct runner. The backend owns its identity and
metadata; no customer settings file, database row or schema migration is created.

Both list views display the same record. View explains the source, destination,
managed protection and prepared-artifact scope. Only the existing server20 owner
gets the deployment link, which opens the authenticated platform updater. It does
not invoke Servix publication or activation. Edit/archive, customer connector
pairing and customer destination tests reject this managed identity at the backend.
Stored files cannot shadow this built-in record; collisions fail closed.

Do not claim automatic laptop commit/push/build, a live source connector, a current
release digest from static metadata, or self-service platform rollback. Existing
platform recovery and preservation remain unchanged. Other project CRUD and
server21 production stay outside scope. Phase 4 exit remains incomplete.

Related: [ADR 0045](0045-account-controls-and-platform-update.md).
