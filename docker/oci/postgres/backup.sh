#!/bin/sh
set -eu

umask 077
stamp="$(date -u +%Y%m%dT%H%M%SZ)"
target="/backups/frevos-${stamp}.dump"
temporary="${target}.partial"

if [ -e "$target" ] || [ -e "$temporary" ]; then
  echo "Backup target already exists; refusing to overwrite." >&2
  exit 1
fi

trap 'rm -f "$temporary"' EXIT HUP INT TERM
pg_dump --host=postgres --username=frevos_migrator --dbname=frevos \
  --format=custom --file="$temporary"
pg_restore --list "$temporary" >/dev/null
mv "$temporary" "$target"
trap - EXIT HUP INT TERM

echo "Validated logical backup created: $(basename "$target")"
