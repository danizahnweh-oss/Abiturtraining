#!/usr/bin/env bash
set -euo pipefail
umask 077

# This file contains connection settings, never passwords or encryption keys.
CONFIG_FILE="${OFFSITE_CONFIG_FILE:-/etc/myabiflow-offsite.conf}"
[[ -f "$CONFIG_FILE" ]] || { echo 'offsite: configuration missing' >&2; exit 1; }
# Configuration is maintained by root and must not be writable by other users.
source "$CONFIG_FILE"
BACKUP_DIR="${OFFSITE_BACKUP_DIR:-/var/backups/myabiflow}"

fail() { echo "offsite: $1" >&2; exit 1; }
[[ "${OFFSITE_TARGET:-}" =~ ^[a-zA-Z0-9_-]+@[a-zA-Z0-9.-]+:[a-zA-Z0-9_-]+$ ]] || fail 'invalid dedicated destination'
[[ "${OFFSITE_SSH_KEY:-}" =~ ^/[a-zA-Z0-9_./-]+$ ]] || fail 'invalid key path'
[[ "${OFFSITE_KNOWN_HOSTS:-}" =~ ^/[a-zA-Z0-9_./-]+$ ]] || fail 'invalid host-key file'
[[ -f "$OFFSITE_SSH_KEY" && -f "$OFFSITE_KNOWN_HOSTS" ]] || fail 'SSH key or known-hosts file missing'
[[ -d "$BACKUP_DIR" ]] || fail 'backup directory missing'

shopt -s nullglob
files=("$BACKUP_DIR"/daily-*.dump.enc "$BACKUP_DIR"/weekly-*.dump.enc "$BACKUP_DIR"/monthly-*.dump.enc)
(( ${#files[@]} > 0 )) || fail 'refusing to sync an empty backup directory'
for file in "${files[@]}"; do
  [[ -f "$file" && ! -L "$file" && -s "$file" ]] || fail 'invalid or empty backup file'
done

ssh_command="ssh -p 23 -o BatchMode=yes -o StrictHostKeyChecking=yes -o IdentitiesOnly=yes -o ConnectTimeout=15 -o ServerAliveInterval=15 -o ServerAliveCountMax=3 -o UserKnownHostsFile=$OFFSITE_KNOWN_HOSTS -i $OFFSITE_SSH_KEY"
# The destination is a separate directory below the restricted sub-account.
# Excluded files (including SSH authorization) are protected from deletion.
# Delay retention deletions until the transfer succeeds; never delete local data.
args=(--recursive --times --perms --chmod=D700,F600 --checksum --timeout=120
  --delete-delay --include='/daily-*.dump.enc' --include='/weekly-*.dump.enc'
  --include='/monthly-*.dump.enc' --exclude='*' --rsh="$ssh_command")
rsync "${args[@]}" -- "$BACKUP_DIR/" "$OFFSITE_TARGET/"

# Verify file contents and retention once more, without changing anything.
changes="$(rsync "${args[@]}" --dry-run --itemize-changes -- "$BACKUP_DIR/" "$OFFSITE_TARGET/")"
[[ -z "$changes" ]] || fail 'destination verification found differences'
printf '%s offsite ok encrypted_files=%s checksum_verified=yes\n' "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" "${#files[@]}"
