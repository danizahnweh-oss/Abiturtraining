# Nachweis externe Datenbanksicherung, 10. Oktober 2026

Ergänzung zum Datenschutz-Prüfbericht vom 6. Oktober 2026. Keine allgemeine
Freigabe für den Schuleinsatz und kein vollständiger Nachweis einer
Wiederherstellung der Anwendung.

## Aktivierter Ablauf

Nach ausdrücklicher Zustimmung des Betreibers wurden die vorhandenen
verschlüsselten PostgreSQL-Sicherungen vom Server in Nürnberg auf eine
separate Hetzner Storage Box BX11 in Falkenstein übertragen. Die tägliche
Ausführung um 03:05 UTC wurde auf den kombinierten Backup-Job umgestellt;
es besteht genau ein entsprechender Cron-Eintrag. Der erste erfolgreiche
Lauf endete am 10. Oktober 2026 um 18:59:02 UTC.

Ein eigener SSH-Schlüssel und ein auf seinen Basisordner begrenzter
Sub-Account ermöglichen die Übertragung ohne Passwortabfrage. Der
Server-Fingerprint wurde mit der offiziellen Hetzner-Dokumentation
abgeglichen. Host-Key-Prüfung ist verpflichtend. Schlüssel und
Verbindungs-Konfiguration befinden sich ausschließlich auf dem Server.

Es werden nur die vorgesehenen verschlüsselten Sicherungsdateien übertragen.
Die bisherige Aufbewahrung (7 tägliche, 4 wöchentliche und 3 monatliche Dateien)
wird im dedizierten externen Zielordner übernommen. Dies dokumentiert den
technischen Ist-Zustand; schulische Löschfristen und der Umgang mit gelöschten
Daten nach einem Restore müssen gesondert festgelegt werden.

## Durchgeführte Prüfungen

- Synthetische Dateien: Filter gegen Klartext-Upload, erfolgreiche Übertragung,
  Entfernung abgelaufener Kopien, Schutz vor Synchronisation einer leeren Quelle,
  SHA-256-Vergleich und Abbruch bei unbekanntem Host-Key mit Erhalt lokaler Dateien.
- Erster produktiver Lauf: 14 verschlüsselte Dateien übertragen und per rsync-
  Prüfsumme auf Übereinstimmung geprüft.
- Neueste externe Datei zurückgelesen: SHA-256 identisch zur lokalen Quelle;
  Entschlüsselung erfolgreich; vollständiges Archiv durch `pg_restore` ohne
  Datenbankziel verarbeitet. Es wurden keine Dateninhalte ausgegeben.
- Temporäre zurückgelesene und entschlüsselte Testdateien anschließend entfernt.
- Installierte Skripte stimmen per SHA-256 mit Git-Commit `888a48f0` überein.
- Vorheriger Zeitplan wurde vor Änderung serverseitig gesichert; kein API-Neustart.

### Vollständiger Datenbank-Restore

Anschließend wurde die externe Sicherung erneut heruntergeladen und per SHA-256
mit der lokalen Quelle verglichen. In einer neu initialisierten PostgreSQL-16-
Testinstanz ohne Netzwerk-Listener wurde das entschlüsselte Archiv vollständig
mit `pg_restore --exit-on-error --no-owner --no-acl` eingespielt. Ergebnis:
Exit-Code 0, alle 28 im Archiv enthaltenen Tabellen vorhanden. Die Testinstanz
hatte ein separates Datenverzeichnis und einen nur lokal zugänglichen Socket.
Produktive Datenbanken wurden nicht verändert. Testinstanz und sämtliche
temporären Dateien wurden danach entfernt. Dieser Test stellt keine Prüfung
der produktiven Rollen, Dateiuploads oder des kompletten Anwendungsstarts dar.

Der Betreiber hat die separate Speicherung des Entschlüsselungsschlüssels im
Passwortmanager nach eigener Durchführung bestätigt. Das ist eine Rückmeldung
des Betreibers; der Inhalt des Passwortmanagers wurde nicht eingesehen.

### Snapshot-Zeitplan laut Betreiber

Der Betreiber bestätigte anschließend die Aktivierung automatischer Storage-
Box-Snapshots: täglich um 04:00 UTC, maximal 10 automatische Snapshots. Der
Zeitpunkt liegt 55 Minuten nach Beginn des Backup-Jobs. Eine erfolgreiche erste
Ausführung und ein Snapshot-Restore wurden noch nicht überprüft. Snapshots
bewahren auch zwischenzeitlich gelöschte Backup-Dateien bis zur Snapshot-Rotation;
diese zusätzliche Aufbewahrung ist im Löschkonzept zu berücksichtigen. Sie liegen
auf derselben Storage Box und sind keine zusätzliche externe Datenkopie.

## Noch nicht bestätigt

Die Vollständigkeit der Sicherung für Dateien, Konfigurationen, produktive
Datenbankrollen und weitere Datenspeicher ist noch nicht bestätigt. Eine aktive
Fehlermeldung an den Betreiber ist noch nicht eingerichtet. Die tatsächliche
Snapshot-Ausführung und der Schutz des Hauptkontos sind noch zu prüfen.
Die Standorttrennung bietet keine Unabhängigkeit vom Anbieter oder Hauptkonto.
