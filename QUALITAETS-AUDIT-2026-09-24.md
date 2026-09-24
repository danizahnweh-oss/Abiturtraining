# myAbiFlow: Qualitäts-, Website- und KI-Audit

Stand: 24. September 2026

## Kurzfazit

Der aktuelle Gymnasiums-Stand ist veröffentlicht. Die zuvor auf Hetzner fehlenden Frontend-Dateien sind jetzt vollständig synchron mit GitHub. Die Bildkette verhindert, dass ein Karikatur-Prompt als bloßer Text in der Prüfung erscheint. Kurze Prüfungen werden serverseitig auf Umfang, Materialanzahl und Aufgabenanzahl geprüft und bei Bedarf automatisch neu erzeugt. Unplausible Korrekturen werden ebenfalls vor der Ausgabe zurückgewiesen und erneut erstellt.

Es gibt aktuell keinen bekannten kritischen technischen Blocker für die geprüften Gymnasiumsseiten. Die größte noch sinnvolle Qualitätssteigerung ist kein weiterer pauschaler Modellwechsel, sondern ein fachlich bewerteter Referenz-Datensatz mit echten Lehrkrafturteilen.

## Was umgesetzt und veröffentlicht wurde

- Karikaturen, Cartoons, Diagramme und Fotos werden nur als erfolgreich behandelt, wenn echte Bilddaten vorliegen.
- Wenn der primäre Bildanbieter ausfällt oder Text statt Bild liefert, greift eine mehrstufige Bild-Fallback-Kette.
- Fehlerhafte Bilder blockieren Schreiben und PDF, bis ein echtes Bild vorliegt; die Bildgenerierung kann wiederholt werden.
- Das Verhalten gilt fachübergreifend für die geprüften Gymnasiumsseiten, nicht nur für Wirtschaft und Recht.
- Physik mit Astrophysik ist als eigenes Fach beziehungsweise eigener Prüfungsweg getrennt.
- Die bayerischen Abiturformate 2026 und die bereitgestellten Referenz-PDFs wurden in die Formatprüfungen einbezogen.
- Prüfungen bis 60 Minuten werden zentral auf zu lange Quellen, zu viele Materialien, zu viele Aufgaben, Platzhalter und ungenutzte Materialien geprüft.
- Für 30 Minuten gelten harte Obergrenzen: höchstens 220 Textwörter, zwei Materialien und zwei Aufgaben.
- Fehlgeschlagene Kurzprüfungsausgaben werden bis zu dreimal mit konkretem Fehlerhinweis und niedrigerer Varianz repariert.
- Bei Korrekturen werden unmögliche Punkte, widersprüchliche Summen, fehlende Begründungen und unzulässige Höchstwerte abgefangen.
- Bewertungsanweisungen verlangen belegbezogene Rückmeldungen, getrennte Bewertungseinheiten und keine erfundenen Schüleraussagen.
- Das Qualitätsmodell kann über `OPENAI_QUALITY_MODEL` kontrolliert als Test- oder Produktionsmodell gewechselt werden.
- Der öffentliche Kolloquium-Pfad leitet jetzt zuverlässig auf die App weiter und liefert nicht mehr 403.
- Der Schulcode-Bereich der Abo-Seite verursacht bei 320 Pixeln auch in Firefox keinen horizontalen Überlauf mehr.
- Browser- und Backend-Tests sind sauber getrennt und können reproduzierbar ausgeführt werden.
- Der Deployment-Healthcheck prüft jetzt die gültige Produktionsadresse statt einer Staging-Adresse mit ungültigem Zertifikat.

## Live-Prüfung kurzer Klausuren

Alle folgenden Ergebnisse stammen aus echten Produktionsaufrufen mit 30 Minuten Bearbeitungszeit:

| Fach | Textwörter | Materialien | Aufgaben | Ergebnis |
|---|---:|---:|---:|---|
| Politik und Gesellschaft | 213 | 2 | 2 | bestanden |
| Wirtschaft und Recht | 92 | 2 | 2 | bestanden |
| Ethik | 95 | 1 | 2 | bestanden |
| Biologie | 0 | 2 | 2 | bestanden |
| Mathematik | 0 | 0 | 2 | bestanden |
| Geographie | 146 | 2 | 2 | bestanden |
| Geschichte | 0 | 1 | 1 | bestanden |
| Evangelische Religion | 132 | 2 | 2 | bestanden |
| Katholische Religion | 149 | 2 | 1 | bestanden |
| Latein | 102 | 1 | 1 | bestanden |
| Chemie | 0 | 0 | 2 | bestanden |
| Physik | 0 | 0 | 2 | bestanden |
| Informatik | 30 | 2 | 2 | bestanden |
| Sport | 113 | 2 | 2 | bestanden |
| Kunst | 81 | 2 | 2 | bestanden |

Englisch, Französisch, Italienisch und Spanisch verwenden feste, prüfungsnahe Formate. Sie werden deshalb über die Format-Regression geprüft und nicht künstlich in ein beliebiges 30-Minuten-Schema gezwungen.

## Browser-, Funktions- und Barrierefreiheitstests

Der breite Live-Lauf umfasste 1.110 Browserprüfungen. Vor dem vollständigen Frontend-Deployment bestanden 1.046; die 64 Fehler lagen gebündelt in Funktionen, deren aktuelle Dateien noch nicht auf Hetzner angekommen waren.

Nach dem vollständigen Deployment:

- Die gezielte Wiederholungs-Suite für alle betroffenen Funktionsgruppen bestand zunächst mit 155 von 159 Prüfungen.
- Die vier verbleibenden Fälle wurden auf einen Firefox-Überlauf und einen veralteten Teststatus eingegrenzt und korrigiert.
- Die abschließenden sechs Prüfungen dieser beiden Fälle bestanden vollständig in Firefox, Chromium und WebKit.
- iPad Hoch- und Querformat bestanden die geprüften Tests zu Überlauf, Eingabegrößen, Touch-Zielen und Viewport.
- Die Gymnasiumsseiten, kritischen Assets, Bild-Fallbacks, Wiederherstellung, Login-Flows, Abiturformate und Astrophysik-Prüfungen bestanden im breiten Lauf.

WCAG-2.1-AA-Prüfung mit pa11y:

| Seite | Befund |
|---|---|
| Startseite | 0 Verstöße |
| Ethik | 0 Verstöße |
| Ethik Abitur | 0 Verstöße |
| Biologie Abitur | 0 Verstöße |
| Barrierefreiheit | 0 Verstöße |
| Impressum | 0 Verstöße |
| Abo und Preise | 0 Verstöße |
| Kolloquiumstrainer inklusive korrigierter Weiterleitung | 0 Verstöße |

Automatische Tests ersetzen keine vollständige manuelle Prüfung mit Screenreader und Tastatur, zeigen aber aktuell keine maschinell erkennbaren WCAG-AA-Verstöße auf den geprüften Seiten.

## Aktuelle KI-Aufteilung

| Aufgabe | Aktuelle Technik | Einschätzung |
|---|---|---|
| Aufgabengenerierung | OpenAI, standardmäßig GPT-5.2 | gute zentrale Qualitätsbasis; jetzt mit Struktur- und Zeitbudgetprüfung |
| Korrektur und Musterlösung | OpenAI, standardmäßig GPT-5.2 | Qualität profitiert stärker von Rubrik, Prüfregeln und Fachevaluation als von blindem Modellwechsel |
| Qualitätsmodell-Test | `OPENAI_QUALITY_MODEL` beziehungsweise `OPENAI_MODEL` | ermöglicht kontrollierte A/B-Tests ohne Codeänderung |
| Bildgenerierung | Gemini 3 Pro Image | primärer Anbieter für hochwertige Prüfungsbilder |
| Bild-Fallback 1 | Ideogram v3 | sinnvoll bei Karikaturen, Cartoons und beschrifteten Darstellungen |
| Bild-Fallback 2/3 | Gemini 3.1 Flash Image und Gemini 2.5 Flash Image | stellt Verfügbarkeit sicher, wenn Primärmodelle scheitern |
| Bildbeschreibung/Caption | GPT-4o mini | ausreichend für Hilfstexte; nicht für die fachliche Kernprüfung verantwortlich |
| Mathematische Extraktion | GPT-4.1 mini | extrahiert prüfbare Ausdrücke effizient |
| Mathematische Verifikation | Wolfram Alpha | sinnvoller deterministischer Gegencheck für Mathematik, Physik und Chemie |
| KI-Tutor | Gemini 2.5 Flash | passend für schnelle Dialoge; fachliche Qualität sollte getrennt evaluiert werden |
| Kolloquium Audio | Gemini Live Native Audio Preview | passend für Echtzeit-Sprechtraining; benötigt fortlaufende Gesprächsevaluation |

## Empfohlene Modellstrategie mit Qualitätsvorrang

Kein flächendeckender Modellwechsel ohne Vergleichsdaten. Das bestehende Qualitätsmodell bleibt die Kontrollgruppe.

1. Für jedes Kernfach 10 bis 20 echte, von Lehrkräften bewertete Referenzfälle anlegen: Aufgabe, Quellen, Erwartungshorizont, Schülerantwort und begründete Bewertung.
2. Aufgabenqualität und Korrekturqualität getrennt messen. Ein Modell kann gute Aufgaben erzeugen und trotzdem schlecht bewerten oder umgekehrt.
3. Ein anspruchsvolleres Modell nur gegen diese Referenzfälle testen. Maßstäbe: Lehrplannähe, fachliche Richtigkeit, Quellenqualität, Zeitangemessenheit, Punktegerechtigkeit und Belegtreue.
4. Zuerst die risikoreichsten Bereiche testen: Deutsch materialgestützt, PuG/WR mit aktuellen Sachverhalten, Geschichte, Ethik/Religion sowie komplexe MINT-Korrekturen.
5. Erst bei nachweisbar besserer Bewertung kontrolliert über `OPENAI_QUALITY_MODEL` ausrollen. Bei Qualitätsrückgang sofort auf das bisherige Modell zurückschalten.
6. Kleine Modelle nur für klar begrenzte Hilfsaufgaben verwenden; die fachliche Endentscheidung bleibt beim Qualitätsmodell plus Validierung.

Diese Vorgehensweise folgt dem Eval-first-Prinzip der offiziellen OpenAI-Dokumentation: erst messbare Qualitätskriterien, dann Prompt- und Modelloptimierung. Referenzen: [Model optimization](https://developers.openai.com/api/docs/guides/model-optimization) und [Evaluation best practices](https://developers.openai.com/api/docs/guides/evaluation-getting-started).

## Feedback zur Website

### Stärken

- Die Positionierung ist klar: bayerische Abschlussprüfungen statt eines allgemeinen KI-Lernprodukts.
- Die Fachtiefe ist außergewöhnlich hoch und deckt auch Spezialfälle wie Astrophysik, Kunst, Religion und verschiedene Sprachformate ab.
- Aufgabe, Bearbeitung, Korrektur und Wiederherstellung bilden einen echten Lernkreislauf.
- Lehrerfunktionen, Aufgabencodes und Schulzugänge schaffen einen glaubwürdigen Weg in den Schulmarkt.
- Die technische Absicherung für Bilder, Browser, Tablets, kleine Displays und Wiederherstellung ist deutlich stärker als bei einem typischen frühen Lernprodukt.
- Die Website kommuniziert inzwischen Grenzen von KI-Feedback und macht Preise sowie Laufzeiten verständlicher.

### Wichtigste Verbesserungsmöglichkeiten

1. **Fachliche Nachweise sichtbar machen.** Auf der Website sollte klar erkennbar sein, wie viele Prüfungen von echten Lehrkräften gegengeprüft wurden und nach welchen Kriterien.
2. **Korrekturtransparenz erhöhen.** Schüler sollten pro Punkt sehen können: Kriterium, Textbeleg, erreichte Bewertungseinheiten und konkrete Verbesserung.
3. **Qualitätsmonitoring aufbauen.** Intern braucht es Kennzahlen pro Fach: Validierungsfehler, automatische Reparaturen, Abbruchrate, Nutzerbeschwerden, Lehrerfreigabe und Korrekturabweichung.
4. **Kernversprechen fokussieren.** Die stärkste Botschaft ist nicht „KI für alles“, sondern „prüfungsnah üben und nachvollziehbares Feedback für das bayerische Abitur erhalten“.
5. **Öffentliche Vertrauensseite ergänzen.** Sinnvoll wären „So entsteht eine Aufgabe“, „So wird korrigiert“, Grenzen, Datenschutz, Bildherkunft und menschliche Qualitätsprüfung an einem Ort.
6. **Bundle des Kolloquiumstrainers verkleinern.** Der Haupt-Build liegt bei rund 1,5 MB JavaScript. Code-Splitting verbessert Ladezeit auf älteren Schulgeräten und schwachen Netzen.
7. **Abhängigkeiten geplant aktualisieren.** Der Frontend-Build meldet derzeit 19 bekannte Paketwarnungen, darunter zwei kritische. Diese sollten mit kontrollierten Updates und Regressionstests abgearbeitet werden, nicht mit einem ungeprüften automatischen Update.

## Feedback zum Unternehmen

myAbiFlow hat eine gute Chance, sich als spezialisiertes Qualitätsprodukt zu positionieren. Der Wettbewerbsvorteil liegt weniger im bloßen Zugang zu KI-Modellen als in Lehrplanwissen, echten Prüfungsformaten, stabiler Auslieferung und nachvollziehbarer Korrektur.

Die wichtigste strategische Entscheidung ist deshalb: Qualität beweisen, nicht nur behaupten. Ein kleiner externer Fachbeirat aus Lehrkräften, dokumentierte Bewertungsvergleiche und veröffentlichte Qualitätskennzahlen würden mehr Vertrauen schaffen als eine lange Featureliste.

Empfohlene Reihenfolge:

1. Lehrerbewerteten Referenz-Datensatz aufbauen.
2. Korrekturqualität pro Kernfach messen und kalibrieren.
3. Ergebnisse als glaubwürdigen Qualitätsnachweis veröffentlichen.
4. Workshops nutzen, um systematisch Lehrerfeedback und Referenzfälle zu sammeln.
5. Danach Schullizenzen und Fachschaftspakete gezielt ausbauen.

## Nächster 30/60/90-Tage-Plan

### In 30 Tagen

- Je fünf Referenzaufgaben für Deutsch, Mathematik, WR, PuG, Englisch und Biologie sammeln.
- Ein einheitliches Lehrer-Bewertungsformular festlegen.
- Dashboard für Validierungsfehler, Reparaturversuche und Nutzerfeedback spezifizieren.
- Kritische Abhängigkeitswarnungen einzeln prüfen und priorisieren.

### In 60 Tagen

- Zwei Qualitätsmodelle blind gegen denselben Referenzsatz testen.
- Mindestens zwei Lehrkräfte pro Kernfach vergleichen lassen.
- Korrekturabweichungen und typische Fehlermuster pro Fach dokumentieren.
- Kolloquium-Bundle per Code-Splitting verkleinern.

### In 90 Tagen

- Das nachweislich bessere Setup fachweise ausrollen.
- Eine öffentliche Qualitäts- und Transparenzseite veröffentlichen.
- Lehrer-Workshop-Ergebnisse in Fallstudien und Schulangebote übersetzen.
- Monatlichen Qualitätsbericht mit festen Grenzwerten etablieren.

## Offene Punkte nach diesem Audit

Keine bekannten kritischen Fehler in den geprüften Gymnasiumsabläufen. Offen bleiben bewusst langfristige Qualitätsaufgaben:

- menschlich bewerteter Referenz-Datensatz,
- kontrollierter Modellvergleich,
- Paket- und Bundle-Aufräumarbeiten,
- manuelle Screenreader-Prüfung,
- fortlaufende fachliche Stichproben bei neuen Lehrplan- und Abiturformaten.

