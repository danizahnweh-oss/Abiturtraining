# myAbiFlow Backup-Setup

`backup-db.sh` erzeugt ein tägliches PostgreSQL-Custom-Dump, verschlüsselt es mit OpenSSL und hält die Aufbewahrung für tägliche, wöchentliche und monatliche Sicherungen sauber. `restore-db.sh` entschlüsselt ein Backup in eine separate Test-Datenbank, spielt es ein und prüft kompakt, ob die wichtigsten Tabellen plausibel befüllt sind.

## Setup auf dem Server

1. Verzeichnisse anlegen:
   ```bash
   mkdir -p /var/backups/myabiflow /var/log/myabiflow && chmod 700 /var/backups/myabiflow
   ```
2. Backup-Key erzeugen:
   ```bash
   openssl rand -base64 64 > /etc/myabiflow-backup.key && chmod 600 /etc/myabiflow-backup.key
   ```
   Diesen Key unbedingt extern sichern. Ohne diesen Key sind vorhandene `.dump.enc`-Backups praktisch nicht mehr restorable. Alternativen zu `openssl enc` waeren spaeter `age` oder `gpg`.
3. Skripte hochkopieren und ausfuehrbar machen:
   ```bash
   install -m 700 scripts/backup/backup-db.sh /usr/local/bin/myabiflow-backup-db
   install -m 700 scripts/backup/restore-db.sh /usr/local/bin/myabiflow-restore-db
   ```
4. Cron eintragen:
   ```cron
   5 3 * * * /usr/local/bin/myabiflow-backup-db >> /var/log/myabiflow/backup.log 2>&1
   ```
   Das ist 03:05 UTC nachts.
5. Sofort manuell testen:
   ```bash
   /usr/local/bin/myabiflow-backup-db
   ls -lh /var/backups/myabiflow
   /usr/local/bin/myabiflow-restore-db /var/backups/myabiflow/daily-YYYY-MM-DD-HHMMSS.dump.enc
   ```

## Offsite-Optionen

### Hetzner Storage Box

- Kostet grob 3.20 EUR pro Monat fuer 1 TB und liegt im gleichen Hetzner-Umfeld.
- `rclone config` starten und einen Remote mit Typ `sftp` anlegen.
- Host ist dein Storage-Box-Hostname, Nutzername und Passwort kommen aus dem Hetzner-Panel.
- Zielpfad z. B. `storagebox:myabiflow-backups`.
- Danach Cron-Umgebung oder Wrapper mit `OFFSITE_RCLONE_REMOTE=storagebox:myabiflow-backups` setzen.
- Ein manueller Test mit `rclone lsd storagebox:` und dann `/usr/local/bin/myabiflow-backup-db` reicht fuer die Erstpruefung.

### Backblaze B2

- Kostet grob 6 USD pro TB und Monat, getrennt von Hetzner und damit robuster gegen Provider-Ausfaelle.
- In Backblaze einen Bucket fuer Backups anlegen und einen Application Key erzeugen.
- `rclone config` starten und einen Remote mit Typ `b2` anlegen.
- Bucket-Pfad z. B. `b2:myabiflow-db-backups`.
- Danach `OFFSITE_RCLONE_REMOTE=b2:myabiflow-db-backups` fuer den Cron setzen.
- Erst mit `rclone ls b2:myabiflow-db-backups` pruefen, dann ein echtes Backup hochlaufen lassen.

### Zweiter Hetzner-Server

- Zweite kleine VM reicht, Hauptziel ist physische Trennung vom Produktivsystem.
- Dedizierten SSH-Key nur fuer Backup-Transfer anlegen und auf dem Zielserver in `authorized_keys` hinterlegen.
- Auf dem Zielserver Verzeichnis wie `/var/backups/myabiflow-offsite` mit restriktiven Rechten anlegen.
- Pragmatisch per `scp` oder `rsync` in einem zweiten Cron-Job oder Wrapper-Skript hochschieben.
- Noch sauberer ist auch hier `rclone` mit `sftp` gegen den zweiten Server, damit `backup-db.sh` unveraendert bleibt.
- Wichtig ist ein regelmaessiger Test, dass der Zielserver wirklich neue Dateien sieht.

## Restore-Test-Routine

Ein Backup ist erst dann etwas wert, wenn der Restore praktisch funktioniert. Deshalb mindestens einmal pro Monat `restore-db.sh` mit einem frischen `.dump.enc` ausfuehren und die Test-Datenbank kurz per `psql` oder Admin-Tool inspizieren.

## Disaster-Fall

1. Neue Maschine bestellen oder bestehende VM neu aufsetzen.
2. PostgreSQL und `pg_dump`/`pg_restore`/`openssl` installieren, Applikationsverzeichnisse vorbereiten.
3. Backup-Key aus externer Sicherung nach `/etc/myabiflow-backup.key` zurueckspielen.
4. Letztes brauchbares Backup lokal oder offsite auf die neue Maschine holen.
5. Mit `myabiflow-restore-db` zuerst Test-Restore machen, dann bewusst in die produktive Datenbank restoren.
6. Backend-Code aus Git deployen und `.env` fuer die neue Maschine setzen.
7. Anwendung starten, Health-Checks machen und danach Domain oder DNS auf die neue Maschine umpointen.
