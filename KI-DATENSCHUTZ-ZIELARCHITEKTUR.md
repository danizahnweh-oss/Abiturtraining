# KI-Datenschutz-Zielarchitektur

Stand: 25. September 2026

## Aktueller Einsatz

| Dienst | Aktuelle Aufgabe | Personenbezug vermeiden |
|---|---|---|
| OpenAI | Aufgabengenerierung, Korrektur und Feedback | Kontoname und E-Mail nicht mitsenden; Freitext kann trotzdem persönliche Angaben enthalten |
| Google Gemini | Kolloquium (Live-Audio), Tutor-Antworten und Bilderzeugung | Kolloquium derzeit nur ab 18; Eingaben serverseitig minimieren |
| Ideogram | Ausschließlich Ersatzdienst für Aufgabenbilder | Nur künstlich erzeugte Bildbeschreibung senden |
| Hugging Face | Embeddings/Suchvektoren für Tutor-Fragen, keine Bilderzeugung | Frage vor Übermittlung bereinigen oder Embeddings selbst hosten |
| Wolfram Alpha | Mathematische Verifikation | Nur Formel bzw. mathematischen Ausdruck senden |

## Empfohlene Zielarchitektur

1. **Eine zentrale KI-Schleuse auf dem Hetzner-Server.** Das Frontend spricht nie direkt mit einem Anbieter. Die Schleuse klassifiziert den Zweck, entfernt Konto-Metadaten, protokolliert nur technische Kennzahlen und erlaubt ausschließlich freigegebene Modelle.
2. **Anbieterregister als Konfiguration.** Jeder Zweck erhält genau einen freigegebenen Hauptanbieter und optional einen geprüften Ersatzanbieter. Hinterlegt werden Zweck, erlaubte Datenklassen, Speicherfrist, Region, Vertragsgrundlage und Altersfreigabe.
3. **Embeddings selbst hosten.** Ein mehrsprachiges Embedding-Modell auf Hetzner ersetzt die Hugging-Face-API. Dadurch verlassen Tutor-Fragen für die Suche den eigenen Server nicht.
4. **Bilder strikt ohne Nutzerdaten erzeugen.** Die Anwendung erstellt aus dem fachlichen Auftrag eine neue, abstrahierte Bildbeschreibung. Namen, E-Mails, hochgeladene Originalbilder und Freitext der Lernenden dürfen nicht an den Bildanbieter gelangen. Langfristig sollte nur ein vertraglich geprüfter Bildanbieter genutzt werden.
5. **Kolloquium für Minderjährige erst nach Anbieterfreigabe.** Bis ein Vertrag bzw. Produkt vorliegt, das die schulische Nutzung Minderjähriger ausdrücklich erlaubt, bleibt die 18+-Sperre aktiv. Danach kann ein Schulmodus mit Auftragsverarbeitung und Rollenregelung ergänzt werden.
6. **Korrekturqualität kontrollieren.** Für bewertende Ausgaben gelten fachbezogene Rubrics, getrennte Erst- und Kontrollbewertung bei niedriger Sicherheit, Quellenbindung und stichprobenartige menschliche Qualitätssicherung. Die KI trifft keine schulrechtlich wirksame Entscheidung.
7. **Lösch- und Auskunftskette.** Für jeden Anbieter wird dokumentiert, welche Daten dort entstehen, wie lange sie gespeichert werden und wie Auskunft, Löschung und Vorfälle bearbeitet werden.

## Empfohlene Reihenfolge

1. Verträge, Altersbedingungen und Speicherfristen der aktuell eingesetzten Anbieter verbindlich prüfen.
2. Hugging-Face-Embeddings nach Hetzner verlagern.
3. Anbieterregister und technische KI-Schleuse einführen.
4. Bildgenerierung auf einen geprüften Anbieter konsolidieren.
5. Kolloquium erst danach für einen geregelten Schul- oder Minderjährigenmodus öffnen.

Diese Architektur ist ein technischer Vorschlag und ersetzt keine rechtliche Prüfung der konkreten Verträge.
