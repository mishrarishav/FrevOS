#!/bin/sh
set -eu

repository_root=/opt/frevos/repository
environment_file=/etc/frevos/uat.env
compose_file="$repository_root/compose.oci.yaml"

fail() {
  echo "ERROR: $*" >&2
  exit 1
}

[ "$(id -u)" -eq 0 ] || fail "run with sudo"
[ "$(uname -m)" = "aarch64" ] || fail "Oracle UAT requires an aarch64 VM"
[ -f "$environment_file" ] || fail "run configure-oci-uat.sh under separate secret-lifecycle authorization first"
[ "$(stat -c '%U:%G:%a' "$environment_file")" = "root:root:600" ] || fail "UAT environment file must be root:root mode 600"
[ -f "$compose_file" ] || fail "reviewed repository must be at $repository_root"

[ -z "$(git -c safe.directory="$repository_root" -C "$repository_root" status --porcelain)" ] || fail "checkout contains changes or untracked files"
actual_sha="$(git -c safe.directory="$repository_root" -C "$repository_root" rev-parse --verify HEAD)"
configured_sha="$(sed -n 's/^FREVOS_SOURCE_SHA=//p' "$environment_file")"
[ -n "$configured_sha" ] && [ "$actual_sha" = "$configured_sha" ] || fail "checked-out source does not match the configured SHA"

compose() {
  docker compose --project-directory "$repository_root" --env-file "$environment_file" \
    --file "$compose_file" "$@"
}

validate() {
  compose config --quiet
  docker buildx imagetools inspect \
    node:24.19.0-bookworm-slim@sha256:3638d9a6fe4030bd716be989438248074489337ba3275657f93595428be4fc03 \
    | grep -q 'linux/arm64' || fail "Node.js image lacks linux/arm64"
  docker buildx imagetools inspect \
    postgres:18.4-bookworm@sha256:882236b897e39051d2368c5ccc6cda944904723506b2dfc97f2a8f5bc9afa382 \
    | grep -q 'linux/arm64' || fail "PostgreSQL image lacks linux/arm64"
  docker buildx imagetools inspect \
    caddy:2.10.2-alpine@sha256:4c6e91c6ed0e2fa03efd5b44747b625fec79bc9cd06ac5235a779726618e530d \
    | grep -q 'linux/arm64' || fail "Caddy image lacks linux/arm64"
  echo "OCI UAT configuration is valid for source $actual_sha."
}

case "${1:-}" in
  validate)
    validate
    ;;
  up)
    validate
    compose up --build --wait
    echo "FrevOS UAT is healthy at the configured HTTPS origin."
    ;;
  status)
    compose ps
    ;;
  logs)
    compose logs --follow --tail 200 frevos caddy postgres
    ;;
  backup)
    compose run --rm backup
    ;;
  restore-check)
    compose run --rm restore-check --confirm-isolated-restore-check
    ;;
  *)
    fail "expected one of: validate, up, status, logs, backup, restore-check"
    ;;
esac
