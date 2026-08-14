#!/bin/sh
set -eu

repository_root=/opt/frevos/repository
environment_directory=/etc/frevos
environment_file="$environment_directory/uat.env"
data_root=/srv/frevos

fail() {
  echo "ERROR: $*" >&2
  exit 1
}

[ "$(id -u)" -eq 0 ] || fail "run with sudo"
[ "$(uname -m)" = "aarch64" ] || fail "Oracle UAT requires an aarch64 VM"
[ -d "$repository_root/.git" ] || fail "reviewed repository must be at $repository_root"
[ ! -e "$environment_file" ] || fail "$environment_file already exists; secret replacement needs separate approval"
command -v docker >/dev/null 2>&1 || fail "Docker Engine is required"
command -v openssl >/dev/null 2>&1 || fail "OpenSSL is required"

[ -z "$(git -c safe.directory="$repository_root" -C "$repository_root" status --porcelain)" ] || fail "checkout contains changes or untracked files"
source_sha="$(git -c safe.directory="$repository_root" -C "$repository_root" rev-parse --verify HEAD)"

prompt() {
  label="$1"
  printf '%s: ' "$label" >&2
  IFS= read -r value </dev/tty || fail "could not read $label"
  printf '%s' "$value"
}

uat_host="$(prompt 'UAT hostname (DNS or IPv4 sslip.io hostname)')"
acme_email="$(prompt 'ACME account email')"
oidc_issuer="$(prompt 'Auth0 issuer (exact https URL ending in /)')"
oidc_client_id="$(prompt 'Auth0 client ID')"
uat_admin_subject="$(prompt 'Auth0 admin test-user subject')"
uat_viewer_subject="$(prompt 'Auth0 viewer test-user subject')"

printf '%s: ' 'Auth0 client secret (hidden)' >&2
trap 'stty echo </dev/tty 2>/dev/null || true; exit 130' HUP INT TERM
stty -echo </dev/tty
if ! IFS= read -r oidc_client_secret </dev/tty; then
  stty echo </dev/tty
  trap - HUP INT TERM
  fail "could not read Auth0 client secret"
fi
stty echo </dev/tty
trap - HUP INT TERM
printf '\n' >&2

printf '%s' "$uat_host" | grep -Eq '^[A-Za-z0-9]([A-Za-z0-9.-]*[A-Za-z0-9])?$' || fail "invalid UAT hostname"
printf '%s' "$acme_email" | grep -Eq '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,63}$' || fail "invalid ACME email"
printf '%s' "$oidc_issuer" | grep -Eq '^https://[A-Za-z0-9]([A-Za-z0-9.-]*[A-Za-z0-9])?/$' || fail "invalid Auth0 issuer"
printf '%s' "$oidc_client_id" | grep -Eq '^[A-Za-z0-9._~-]{1,255}$' || fail "invalid Auth0 client ID"
printf '%s' "$oidc_client_secret" | grep -Eq '^[A-Za-z0-9._~-]{1,512}$' || fail "client secret contains unsupported characters"
printf '%s' "$uat_admin_subject" | grep -Eq '^[A-Za-z0-9._|:@/-]{1,255}$' || fail "invalid admin subject"
printf '%s' "$uat_viewer_subject" | grep -Eq '^[A-Za-z0-9._|:@/-]{1,255}$' || fail "invalid viewer subject"
[ "$uat_admin_subject" != "$uat_viewer_subject" ] || fail "test-user subjects must differ"

db_migrator_password="$(openssl rand -hex 32)"
db_runtime_password="$(openssl rand -hex 32)"
transaction_key="$(openssl rand -base64 32 | tr '+/' '-_' | tr -d '=\r\n')"
[ "${#transaction_key}" -eq 43 ] || fail "could not generate the OIDC transaction key"
temporary_file="$(mktemp)"
trap 'rm -f "$temporary_file"' EXIT HUP INT TERM
umask 077

cat >"$temporary_file" <<EOF
FREVOS_DATA_ROOT=$data_root
FREVOS_SOURCE_SHA=$source_sha
FREVOS_UAT_HOST=$uat_host
FREVOS_ACME_EMAIL=$acme_email
FREVOS_OIDC_ISSUER=$oidc_issuer
FREVOS_OIDC_CLIENT_ID=$oidc_client_id
FREVOS_OIDC_CLIENT_SECRET=$oidc_client_secret
FREVOS_OIDC_TRANSACTION_KEY=$transaction_key
FREVOS_DB_MIGRATOR_PASSWORD=$db_migrator_password
FREVOS_DB_RUNTIME_PASSWORD=$db_runtime_password
FREVOS_UAT_ADMIN_SUBJECT=$uat_admin_subject
FREVOS_UAT_VIEWER_SUBJECT=$uat_viewer_subject
EOF

install -d -o root -g root -m 0700 "$environment_directory"
install -d -o 999 -g 999 -m 0700 "$data_root/postgres" "$data_root/backups"
install -d -o 1000 -g 1000 -m 0700 "$data_root/caddy-data" "$data_root/caddy-config"
install -o root -g root -m 0600 "$temporary_file" "$environment_file"
rm -f "$temporary_file"
trap - EXIT HUP INT TERM

echo "Oracle UAT boundary configured for source $source_sha. Secret values were not printed."
echo "Run: sudo sh $repository_root/scripts/oci-uat.sh validate"
