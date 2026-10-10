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

## Noch nicht bestätigt

Ein vollständiger Restore in einer isolierten Datenbank, die separate externe
Aufbewahrung des Entschlüsselungsschlüssels und die Vollständigkeit für Dateien,
Konfigurationen sowie weitere Datenspeicher sind nicht bestätigt. Eine aktive
Fehlermeldung an den Betreiber und separat verwaltete Schutzkopien gegen
Löschung durch kompromittierte Zugangsdaten sind noch nicht eingerichtet.
Die Standorttrennung bietet keine Unabhängigkeit vom Anbieter oder Hauptkonto.
