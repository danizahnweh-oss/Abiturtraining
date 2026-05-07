# Health-Monitoring für myAbiFlow

Der Endpoint `https://myabiflow.de/api/health` liefert immer JSON mit `status`, `timestamp`, `version` und einzelnen `checks` für `db`, `openai`, `gemini`, `stripe` und `gemini_proxy`.

## Beispiel `ok`

```json
{
  "status": "ok",
  "timestamp": "2026-05-07T12:00:00.000Z",
  "version": "abc123",
  "checks": {
    "db": { "status": "ok", "duration_ms": 21, "error": null },
    "openai": { "status": "ok" },
    "gemini": { "status": "ok" },
    "stripe": { "status": "ok" },
    "gemini_proxy": { "status": "ok", "duration_ms": 14 }
  }
}
```

## Beispiel `degraded`

```json
{
  "status": "degraded",
  "timestamp": "2026-05-07T12:00:00.000Z",
  "version": "abc123",
  "checks": {
    "db": { "status": "ok", "duration_ms": 33, "error": null },
    "openai": { "status": "ok" },
    "gemini": { "status": "missing" },
    "stripe": { "status": "ok" },
    "gemini_proxy": { "status": "unknown", "duration_ms": 3000 }
  }
}
```

## Beispiel `error`

```json
{
  "status": "error",
  "timestamp": "2026-05-07T12:00:00.000Z",
  "version": "abc123",
  "checks": {
    "db": { "status": "error", "duration_ms": 3000, "error": "timeout" },
    "openai": { "status": "ok" },
    "gemini": { "status": "ok" },
    "stripe": { "status": "ok" },
    "gemini_proxy": { "status": "ok", "duration_ms": 12 }
  }
}
```

## UptimeRobot-Setup

1. Account bei UptimeRobot erstellen.
2. Monitor 1 anlegen: `HTTP(s)`, URL `https://myabiflow.de/api/health`, Interval `5 minutes`, Alerts an `info@myabiflow.de`.
3. Monitor 2 anlegen: `Keyword`, gleiche URL, Keyword `"status":"ok"`. Das schlägt auch bei `degraded` an.
4. Monitor 3 anlegen: `Ping`, Host `162.55.62.231`, damit kompletter Host-Ausfall separat sichtbar ist.

## Alternative für Cron-Jobs: Healthchecks.io

Für Backup-/Cron-Jobs eignet sich ein Heartbeat besser als HTTP-Polling:

```bash
HC_URL="https://hc-ping.com/REPLACE_WITH_UUID"
curl -fsS -m 10 --retry 3 "$HC_URL/start" >/dev/null || true
run_backup_command
backup_exit_code=$?
if [ "$backup_exit_code" -eq 0 ]; then curl -fsS -m 10 --retry 3 "$HC_URL" >/dev/null || true; fi
exit "$backup_exit_code"
```

## Manuell prüfen

```bash
curl -s https://myabiflow.de/api/health | jq .
```

## Was tun bei Alert

1. Health-JSON ansehen: Welcher Check ist rot oder `missing`?
2. PM2-Status prüfen: `pm2 list`
3. Relevante Logs prüfen: `pm2 logs <name> --lines 50`
4. Bei DB-Problemen PostgreSQL prüfen: `systemctl status postgresql`
5. Bei vollem Storage prüfen: `df -h`
