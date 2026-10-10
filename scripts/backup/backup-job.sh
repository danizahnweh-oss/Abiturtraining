#!/usr/bin/env bash
set -euo pipefail
umask 077

# One lock covers generation, retention, transfer and verification.
exec 9>/run/lock/myabiflow-backup.lock
flock -n 9 || { echo 'backup job: another run is active' >&2; exit 1; }
/usr/local/bin/myabiflow-backup-db
/usr/local/bin/myabiflow-backup-offsite
