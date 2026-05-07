#!/usr/bin/env bash
set -euo pipefail

ENV_FILE="/app/myabiflow-backend/.env"
KEY_FILE="/etc/myabiflow-backup.key"
RESTORE_DB="myabiflow_restore_test"
OPENSSL_BIN="${OPENSSL_BIN:-openssl}"
PG_RESTORE_BIN="${PG_RESTORE_BIN:-pg_restore}"
PSQL_BIN="${PSQL_BIN:-psql}"
DROPDB_BIN="${DROPDB_BIN:-dropdb}"
CREATEDB_BIN="${CREATEDB_BIN:-createdb}"

warn() {
  printf 'WARN: %s\n' "$1" >&2
}

fail() {
  printf 'restore-db.sh: %s\n' "$1" >&2
  exit 1
}

usage() {
  printf 'Usage: %s /pfad/zum/backup.dump.enc\n' "${0##*/}" >&2
  exit 1
}

load_database_url() {
  [[ -f "$ENV_FILE" ]] || fail "Datei fehlt: $ENV_FILE"

  local line
  line="$(grep -E '^DATABASE_URL=' "$ENV_FILE" | tail -n 1 || true)"
  [[ -n "$line" ]] || fail "DATABASE_URL nicht in $ENV_FILE gefunden"

  DATABASE_URL="${line#DATABASE_URL=}"
  DATABASE_URL="${DATABASE_URL%\"}"
  DATABASE_URL="${DATABASE_URL#\"}"
  DATABASE_URL="${DATABASE_URL%\'}"
  DATABASE_URL="${DATABASE_URL#\'}"
  [[ -n "$DATABASE_URL" ]] || fail "DATABASE_URL ist leer"
}

database_admin_url() {
  if [[ "$DATABASE_URL" =~ ^postgres(ql)?:// ]]; then
    printf '%s\n' "${DATABASE_URL%/*}/postgres"
    return 0
  fi

  if [[ "$DATABASE_URL" == *" dbname="* ]]; then
    printf '%s\n' "${DATABASE_URL/ dbname=*/ dbname=postgres}"
    return 0
  fi

  fail "Unbekanntes DATABASE_URL-Format"
}

database_named_url() {
  local db_name="$1"

  if [[ "$DATABASE_URL" =~ ^postgres(ql)?:// ]]; then
    printf '%s\n' "${DATABASE_URL%/*}/$db_name"
    return 0
  fi

  if [[ "$DATABASE_URL" == *" dbname="* ]]; then
    printf '%s\n' "${DATABASE_URL/ dbname=*/ dbname=$db_name}"
    return 0
  fi

  fail "Unbekanntes DATABASE_URL-Format"
}

table_exists() {
  local admin_url="$1"
  local table_name="$2"

  "$PSQL_BIN" "$admin_url" -Atqc "SELECT to_regclass('public.${table_name}') IS NOT NULL;" | grep -qx 't'
}

table_count() {
  local admin_url="$1"
  local table_name="$2"

  "$PSQL_BIN" "$admin_url" -Atqc "SELECT count(*) FROM public.${table_name};"
}

main() {
  [[ $# -eq 1 ]] || usage
  local encrypted_backup="$1"
  [[ -f "$encrypted_backup" ]] || fail "Backup-Datei nicht gefunden: $encrypted_backup"
  [[ "$encrypted_backup" == *.dump.enc ]] || fail "Erwartet Datei mit Endung .dump.enc"

  command -v "$OPENSSL_BIN" >/dev/null 2>&1 || fail "openssl nicht gefunden"
  command -v "$PG_RESTORE_BIN" >/dev/null 2>&1 || fail "pg_restore nicht gefunden"
  command -v "$PSQL_BIN" >/dev/null 2>&1 || fail "psql nicht gefunden"
  command -v "$DROPDB_BIN" >/dev/null 2>&1 || fail "dropdb nicht gefunden"
  command -v "$CREATEDB_BIN" >/dev/null 2>&1 || fail "createdb nicht gefunden"
  [[ -f "$KEY_FILE" ]] || fail "Key-Datei fehlt: $KEY_FILE"

  load_database_url

  local tmp_dump admin_url restore_url
  tmp_dump="$(mktemp /tmp/restore-XXXXXX.dump)"
  trap 'rm -f -- "$tmp_dump"' EXIT INT TERM

  "$OPENSSL_BIN" enc -d -aes-256-cbc -pbkdf2 \
    -pass "file:$KEY_FILE" \
    -in "$encrypted_backup" \
    -out "$tmp_dump"

  admin_url="$(database_admin_url)"
  restore_url="$(database_named_url "$RESTORE_DB")"

  "$DROPDB_BIN" --if-exists --force --dbname="$admin_url" "$RESTORE_DB"
  "$CREATEDB_BIN" --dbname="$admin_url" "$RESTORE_DB"

  "$PG_RESTORE_BIN" \
    --dbname="$restore_url" \
    --no-owner \
    --no-acl \
    "$tmp_dump"

  printf '%-16s %-12s %s\n' 'Tabelle' 'Zeilen' 'OK'
  local table count ok
  for table in students teachers results subscriptions messages; do
    if table_exists "$restore_url" "$table"; then
      count="$(table_count "$restore_url" "$table")"
      ok="ja"
    else
      count="-"
      ok="warn"
      warn "Tabelle fehlt in Restore-DB: $table"
    fi
    printf '%-16s %-12s %s\n' "$table" "$count" "$ok"
  done

  printf 'Test-DB stehen gelassen. Drop mit: dropdb %s\n' "$RESTORE_DB"
}

main "$@"
