#!/bin/sh
set -eu

psql --set=ON_ERROR_STOP=1 --set=runtime_password="$FREVOS_DB_RUNTIME_PASSWORD" \
  --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-'SQL'
CREATE ROLE frevos_runtime LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS PASSWORD :'runtime_password';
SQL

psql --set=ON_ERROR_STOP=1 --set=keycloak_password="$FREVOS_DB_KEYCLOAK_PASSWORD" \
  --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-'SQL'
CREATE ROLE frevos_keycloak LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS PASSWORD :'keycloak_password';
SQL

createdb --username "$POSTGRES_USER" --owner frevos_keycloak frevos_keycloak
