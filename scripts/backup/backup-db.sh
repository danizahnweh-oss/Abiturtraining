#!/usr/bin/env bash
set -euo pipefail

ENV_FILE="/app/myabiflow-backend/.env"
BACKUP_DIR="/var/backups/myabiflow"
LOG_FILE="/var/log/myabiflow/backup.log"
KEY_FILE="/etc/myabiflow-backup.key"
STAMP="$(date -u '+%Y-%m-%d-%H%M%S')"
PG_DUMP_BIN="${PG_DUMP_BIN:-pg_dump}"
OPENSSL_BIN="${OPENSSL_BIN:-openssl}"
RCLONE_BIN="${RCLONE_BIN:-rclone}"

log_success() {
  local message="$1"
  mkdir -p "$(dirname "$LOG_FILE")"
  printf '%s %s\n' "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" "$message" >>"$LOG_FILE"
}

fail() {
  local message="$1"
  printf 'backup-db.sh: %s\n' "$message" >&2
  exit 1
}

require_file() {
  local path="$1"
  [[ -f "$path" ]] || fail "Datei fehlt: $path"
}

load_database_url() {
  require_file "$ENV_FILE"

  local line
  line="$(grep -E '^DATABASE_URL=' "$ENV_FILE" | tail -n 1 || true)"
  [[ -n "$line" ]] || fail "DATABASE_URL nicht in $ENV_FILE gefunden"

  DATABASE_URL="${line#DATABASE_URL=}"
  DATABASE_URL="${DATABASE_URL%\"}"
  DATABASE_URL="${DATABASE_URL#\"}"
  DATABASE_URL="${DATABASE_URL%\'}"
  DATABASE_URL="${DATABASE_URL#\'}"
  [[ -n "$DATABASE_URL" ]] || fail "DATABASE_URL ist leer"

  export DATABASE_URL
}

retention_prefix() {
  local day_of_week day_of_month
  day_of_week="$(date -u '+%u')"
  day_of_month="$(date -u '+%d')"

  if [[ "$day_of_month" == "01" ]]; then
    printf 'monthly'
  elif [[ "$day_of_week" == "7" ]]; then
    printf 'weekly'
  else
    printf 'daily'
  fi
}

prune_prefix() {
  local prefix="$1"
  local keep="$2"
  local -a files=()

  while IFS= read -r file; do
    files+=("$file")
  done < <(find "$BACKUP_DIR" -maxdepth 1 -type f -name "${prefix}-*.dump.enc" -print | sort)

  local total="${#files[@]}"
  (( total > keep )) || return 0

  local remove_count=$((total - keep))
  local i
  for ((i = 0; i < remove_count; i += 1)); do
    rm -f -- "${files[$i]}"
  done
}

count_backups() {
  find "$BACKUP_DIR" -maxdepth 1 -type f -name '*.dump.enc' | wc -l | tr -d '[:space:]'
}

main() {
  command -v "$PG_DUMP_BIN" >/dev/null 2>&1 || fail "pg_dump nicht gefunden"
  command -v "$OPENSSL_BIN" >/dev/null 2>&1 || fail "openssl nicht gefunden"

  require_file "$KEY_FILE"
  mkdir -p "$BACKUP_DIR" "$(dirname "$LOG_FILE")"
  chmod 700 "$BACKUP_DIR" || true

  load_database_url

  local prefix plain_file encrypted_file size_bytes backup_count
  prefix="$(retention_prefix)"
  plain_file="$BACKUP_DIR/${prefix}-${STAMP}.dump"
  encrypted_file="${plain_file}.enc"

  trap 'rm -f -- "$plain_file" "$encrypted_file"' INT TERM ERR

  "$PG_DUMP_BIN" \
    --dbname="$DATABASE_URL" \
    --format=custom \
    --compress=9 \
    --file="$plain_file"

  "$OPENSSL_BIN" enc -aes-256-cbc -pbkdf2 -salt \
    -pass "file:$KEY_FILE" \
    -in "$plain_file" \
    -out "$encrypted_file"

  rm -f -- "$plain_file"
  trap 'rm -f -- "$encrypted_file"' INT TERM ERR

  prune_prefix "daily" 7
  prune_prefix "weekly" 4
  prune_prefix "monthly" 3

  if [[ -n "${OFFSITE_RCLONE_REMOTE:-}" ]]; then
    command -v "$RCLONE_BIN" >/dev/null 2>&1 || fail "OFFSITE_RCLONE_REMOTE gesetzt, aber rclone nicht gefunden"
    "$RCLONE_BIN" copy "$BACKUP_DIR" "$OFFSITE_RCLONE_REMOTE"
  fi

  size_bytes="$(wc -c <"$encrypted_file" | tr -d '[:space:]')"
  backup_count="$(count_backups)"
  log_success "backup ok file=$(basename "$encrypted_file") size_bytes=$size_bytes backups_total=$backup_count"

  trap - INT TERM ERR
}

main "$@"
