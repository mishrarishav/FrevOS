#!/bin/sh
set -eu

if [ "${1:-}" != "--confirm-isolated-restore-check" ]; then
  echo "Exact isolated restore-check confirmation is required." >&2
  exit 1
fi

source_file="$(find /backups -maxdepth 1 -type f -name 'frevos-*.dump' -print | sort | tail -n 1)"
if [ -z "$source_file" ]; then
  echo "No validated logical backup is available." >&2
  exit 1
fi

check_database=frevos_restore_check
cleanup() {
  dropdb --host=postgres --username=frevos_migrator --if-exists --force "$check_database" \
    >/dev/null 2>&1 || true
}
trap cleanup EXIT HUP INT TERM

cleanup
createdb --host=postgres --username=frevos_migrator "$check_database"
pg_restore --host=postgres --username=frevos_migrator --dbname="$check_database" \
  --exit-on-error "$source_file" >/dev/null
validation="$(psql --host=postgres --username=frevos_migrator --dbname="$check_database" \
  --tuples-only --no-align --command="SELECT CASE WHEN to_regclass('frevos.workspaces') IS NOT NULL AND to_regclass('public.frevos_schema_migrations') IS NOT NULL THEN 'ok' ELSE 'invalid' END")"

if [ "$validation" != "ok" ]; then
  echo "Isolated restore validation failed." >&2
  exit 1
fi

dropdb --host=postgres --username=frevos_migrator --force "$check_database"
trap - EXIT HUP INT TERM
echo "Isolated restore check passed for $(basename "$source_file"); temporary database removed."
