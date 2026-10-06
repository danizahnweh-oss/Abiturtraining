# Schulunterlagen myAbiFlow – Entwurf zur Vervollständigung

**Stand: 6. Oktober 2026 · Bayern · geplanter verbindlicher Unterricht.**

Dieses Paket dient der Zusammenarbeit zwischen Betreiber, erster Partnerschule und Datenschutzfachperson. Es ist noch kein unterschriftsreifer Vertrag und darf nicht als bereits genehmigtes Schulangebot ausgegeben werden. Eckige Platzhalter müssen ausgefüllt, technische Zusagen umgesetzt und durch Nachweise belegt werden. Der [Prüfbericht](PRUEFBERICHT-2026-10-06.md) beschreibt den heutigen Stand.

## A. Deckblatt der konkreten Schule

| Angabe | Eintrag |
|---|---|
| Verantwortliche Schule/Träger und Vertretung | [Name, Anschrift, zuständige Person] |
| Schulart und Jahrgänge | [Gymnasium/FOS/BOS/andere; Jahrgänge und Altersgruppen] |
| Verantwortlicher Schul-DSB | [Name/Funktion, Kontakt] |
| Betreiberkontakt | myAbiFlow UG (haftungsbeschränkt), Daniel Zahnweh, info@myabiflow.de |
| Datenschutzkontakt/DSB des Anbieters | [Pflicht prüfen, benennen, Kontakt veröffentlichen] |
| Geprüfte Produktversion | [Commit, Konfiguration, Anbieterstand, Datum] |
| Module und beabsichtigter Unterrichtszweck | [Nur konkret benötigte Funktionen] |
| Anzahl Konten und Klassen | [Umfang] |
| Geplanter Beginn/Ende | [Datum; keine automatische Freigabe durch Datum] |
| Einsatzform | Verbindlicher Unterricht; freiwillige Zusatzfunktionen getrennt aufführen |
| Verantwortliche für die schulische Entscheidung | [Funktion, Name, Datum, dokumentierte Entscheidung] |

Ein erster Demonstrationstermin kann mit frei erfundenen Beispielen stattfinden. Reale Schülertexte, Namen, Bild- oder Tonaufnahmen sollen erst nach Abschluss der für den Pilot erforderlichen Prüfung verwendet werden.

## B. Zielbild und Rollen

Das Schulangebot soll einen eigenen, werbefreien Zugang erhalten. Die Schule vergibt pseudonyme Konten und hält die Namenszuordnung selbst. Ein Schulzugang darf keine private E-Mail-Adresse, ein privates Abonnement oder eine Werbeeinwilligung voraussetzen. Die Plattform trennt Schule, Kurs, Fach und Rolle technisch und verarbeitet Inhalte nur mit den ausdrücklich freigegebenen Diensten. Das ist ein **Sollzustand**, der noch nicht vollständig implementiert ist.

| Vorgang | Verantwortliche Stelle | Rolle von myAbiFlow | Abgrenzung |
|---|---|---|---|
| Unterrichtsaufgaben und individuelle Lernrückmeldung | Schule, sofern sie Zwecke/Mittel bestimmt | Auftragsverarbeiter im vereinbarten Umfang | Keine eigene Werbung, kein allgemeines Modelltraining und keine eigene Profilverwertung |
| Kurszuordnung und notwendiger Einblick der Lehrkraft | Schule | Umsetzung dokumentierter Berechtigungen | Kein schulübergreifender Zugang über bloßen Namen oder erratbaren Code |
| Schulvertragsabrechnung | Nach tatsächlichem Vertrag bestimmen | Regelmäßig eigene Verantwortung für eigene Geschäftsunterlagen | Schüler-Leistungsprofile gehören nicht auf Rechnungen oder zum Zahlungsanbieter |
| Erforderliche technische Sicherheit | Im Auftrag und/oder eigene Verantwortung, konkret abgrenzen | Rolle und Umfang pro Verarbeitung dokumentieren | Keine unbegrenzte Nutzung aller Lerndaten unter dem Etikett Sicherheit |
| Private Nutzung außerhalb des Schulauftrags | Anbieter nach eigener Vertragskonstellation | Eigene Verantwortung | Keine automatische Zusammenführung mit dem Schulkonto |
| Öffentliche Website/Marketing | Anbieter | Eigene Verantwortung | Keine Übernahme von Schulkennungen, Ergebnissen oder Nutzungsprofilen |

## C. AVV: verbindlich zu regelnde Inhalte

Nach Art. 28 DSGVO ist vor der Auftragsverarbeitung eine wirksame Vereinbarung erforderlich. Folgende Bausteine sind für einen Vertragsentwurf auszufüllen. Die konkret vereinbarten Fristen und Garantien müssen sich anschließend in der Technik wiederfinden. [BayLDA zur Auftragsverarbeitung](https://www.lda.bayern.de/de/thema_auftragsverarbeitung.html).

1. **Parteien und Gegenstand:** [Schule] beauftragt [myAbiFlow UG] mit [präziser Funktionsumfang]. Beginn, Dauer, Kündigung und Rückgabe-/Löschphase: [Eintrag]. Keine pauschale Beauftragung sämtlicher zukünftiger KI-Funktionen.
2. **Art und Zweck:** Bereitstellung der vereinbarten Lernumgebung; Verarbeitung von [konkrete Datenkategorien] für [Unterrichtszwecke]. Betroffene: [Lernende, pädagogisches Personal, gegebenenfalls andere Gruppen]. Besondere Kategorien sind [ausgeschlossen beziehungsweise gesondert rechtlich und technisch geregelt].
3. **Weisungen:** Verarbeitung ausschließlich auf dokumentierte Weisung, einschließlich Übermittlungen in Drittländer; gesetzliche Ausnahmen und Informationspflichten nach Art. 28 Abs. 3 Buchst. a abbilden. Weisungsberechtigte, Empfänger und Änderungsweg: [Eintrag]. Rechtswidrige Weisungen unverzüglich anzeigen.
4. **Vertraulichkeit:** Berechtigte Personen verpflichten; Zugriff nur nach Aufgabenbedarf; Schulung und Nachweise. Keine unkontrollierte Einsichtnahme durch Entwicklung oder Support.
5. **TOM:** Verbindliche Anlage mit umgesetztem Versionsstand, Wirksamkeitsnachweisen und Aktualisierungsprozess. Keine rein geplanten Maßnahmen als bestehenden Schutz ausweisen.
6. **Unterauftragnehmer:** Genehmigungsmodell, vollständige Liste und rechtzeitige Änderungsinformation vereinbaren; bei allgemeiner Genehmigung Widerspruchsmöglichkeit und Konsequenzen regeln. Gleiche Datenschutzpflichten in der Kette sicherstellen.
7. **Betroffenenrechte:** Anfragen unverzüglich der Schule zuordnen; Unterstützung für Auskunft, Kopie, Berichtigung, Einschränkung, Löschung und gegebenenfalls Übertragbarkeit. Keine eigenmächtige Antwort im Namen der Schule ohne vereinbarten Auftrag.
8. **Vorfälle:** Anbieter informiert die Schule unverzüglich nach Bekanntwerden einer Verletzung personenbezogener Daten. Vertragliches Ziel für die erste Meldung: [z.B. 12 Stunden als intern zu vereinbarende Leistungszusage, keine gesetzliche Standardfrist]. Unvollständige Informationen nachliefern; Kontakt außerhalb der Geschäftszeiten und Vertretung regeln.
9. **DSFA/Konsultation:** Anbieter liefert Datenflüsse, technische Informationen, Anbieterunterlagen und Risikonachweise zur Unterstützung nach Art. 28 Abs. 3 Buchst. f. Die Schule bleibt für ihre Entscheidung verantwortlich.
10. **Kontrollrechte:** Nachweise, Inspektionen/Audits und erforderliche Informationen zulassen; ein Zertifikat ersetzt nicht sämtliche Kontrollrechte. Zuständigkeiten, Zugang und angemessene organisatorische Abläufe regeln.
11. **Rückgabe und Löschung:** Wahlrecht und Weisung der Schule am Vertragsende; produktive Daten, Jobs, Sitzungen, Anbieter, lokale Kopien und Backups berücksichtigen. Gesetzliche Speicherpflichten eng abgrenzen. Löschbestätigung mit Ausnahmen/Restfristen statt pauschalem „alles gelöscht“.
12. **Standorte und Fernzugriffe:** [Länder, Systeme, Support, Unterauftragnehmer]. Keine unbemerkte Migration oder zusätzliche KI-Fallbacks. Transfergrundlagen in eigener Anlage.
13. **Eigenzwecke:** Zulässige eigene Verarbeitungen des Anbieters ausdrücklich außerhalb des Schulauftrags abgrenzen und gesondert informieren. Kein einseitiger Vorbehalt zur Weiterverwendung von Schülertexten.
14. **Unterschriften/Einbeziehung:** [Vertretungsberechtigte, Version, Anlagen, Datum, wirksamer elektronischer Abschluss]. Die Veröffentlichung einer Vorlage ersetzt den Vertragsschluss nicht.

Benötigte Anlagen: Leistungsverzeichnis, Datenarten/Betroffene, TOM, Unterauftragnehmer, Verarbeitungsorte/Transfernachweise, Lösch- und Rückgabeverfahren, Kontakte/Weisungen, Auditnachweise.

## D. Verzeichnis der Verarbeitungstätigkeiten – Arbeitsgrundlage

Die Schule führt das Verzeichnis ihrer verantworteten Zwecke nach Art. 30 Abs. 1. myAbiFlow benötigt für Schulaufträge ein Verzeichnis nach Abs. 2 und für eigene Zwecke gegebenenfalls ein zusätzliches nach Abs. 1. Diese Tabelle ist ein Ausgangspunkt und ersetzt nicht die Pflichtangaben.

| Vorgang | Betroffene/Daten | Zweck und Grundlage zu dokumentieren | Empfänger | Frist/Schutz |
|---|---|---|---|---|
| Schulzugang | Lernende/Personal; pseudonyme ID, Rolle, Schul-/Kurszuordnung, Login | Notwendiger Zugang zum festgelegten Unterricht; schulische Rechtsgrundlage | Betreiber, freigegebenes Hosting | Austritt, Schulart und Datenkategorie; kein Klarname im KI-Aufruf nötig |
| Aufgaben und Feedback | Lösungen, Bilder, Fach, Feedback, Punkte | Konkrete Lernaufgabe und notwendiger Rückmeldeumfang | Freigegebene KI-Verarbeitung; zuständige Lehrkraft | Kategorie nach BaySchO bestimmen; minimale Anbieterretention |
| Kompetenzprofil/Lernplan | Zusammengefasste Leistungen und Fehler | Erforderlichkeit des Profils gesondert begründen | Anbieter, gegebenenfalls freigegebener KI-Dienst | Transparenz, Korrektur, Zugriff; nicht automatisch lehrkraftöffentlich |
| Audioübung | Stimme, Kontext, Transkript, Feedback | Erforderlichkeit von Liveaudio und etwaiger Speicherung getrennt | Nur bestätigter geeigneter Dienst | Liveübertragung/Aufnahme/Transkript trennen; sofortige Zwecklöschung prüfen |
| Sicherheitsbetrieb | IP, notwendige Ereignisse, Fehlercodes | Risikobezogener Schutz, Rollenabgrenzung | Beauftragter Betrieb | Kurze Fristen, keine Inhalte/Token in Logs |
| Support/Rechteanfrage | Kontakt, Fallbeschreibung, erforderliche Kontoreferenz | Bearbeitung konkreter Anfrage | Eng begrenzter Support, ggf. Schule | Nach Abschluss begrenzte Nachweisfrist; Zugriff dokumentieren |
| Schulrechnung | Ansprechpartner, Vertrag, Rechnung | Vertrag und gesetzliche Geschäftsunterlagen | Zahlungs-/Steuerdienstleister nach Rolle | Konkrete gesetzliche Frist je Unterlage; kein Lernverlauf |

Pro Eintrag ergänzen: Verantwortlicher/Vertreter und DSB, Rechtsgrundlage und Erforderlichkeitsvermerk, Kategorien/Umfang, Drittlanddetails, Löschfrist, TOM-Verweis, Systeme, Version, verantwortliche Person, letzte Prüfung. Falls Daten nicht bei den Betroffenen erhoben werden, Art. 14 einschließlich einschlägiger Ausnahmen prüfen.

## E. Anbieterregister und Nachweisanforderung

Für **jeden** vorgesehenen Dienst sowie jeden Ersatzdienst ist eine eigene Zeile mit folgenden Feldern anzulegen:

| Pflichtfeld | Benötigter Nachweis |
|---|---|
| Rechtsträger und Produkt | Vollständige Firma/Anschrift, exaktes API-Produkt, Kundenkonto/Projekt und Vertragsfassung |
| Rolle je Datenkategorie | Auftragsverarbeiter, Unterauftragnehmer oder eigene Verantwortung; keine pauschale Einordnung der ganzen Firma |
| Zweck und übermittelte Daten | Repräsentative synthetische Anfrage, technische Feldliste, Nachweis der Minimierung |
| Minderjährige | Ausdrückliche Eignung der konkreten Vertrags-/Produktkonstellation für die Zielgruppe |
| Training/Produktverbesserung | Vertragliche Ausschlüsse und wirksame Kontoeinstellungen; Ausnahmen dokumentieren |
| Orte und Personen | Datenverarbeitung, Backups, Support und menschliche Sicherheitsprüfung einschließlich Länder |
| Unterauftragnehmer | Aktuelle Liste, Änderungen, Genehmigungs-/Widerspruchsverfahren |
| Art. 28 | Geltender AVV/DPA und wirksame Einbeziehung; nicht bloß ein Link auf beliebige Bedingungen |
| Drittlandgrundlage | Tatsächlicher Empfänger und Anwendungsbereich eines Angemessenheitsbeschlusses; andernfalls geeignetes Instrument samt erforderlicher Bewertung/Zusatzmaßnahmen |
| Fristen/Löschung | Eingaben, Ausgaben, Missbrauchslogs, Dateien, Fehlerdaten, Backups; Lösch- und Auskunftsunterstützung |
| Sicherheit | TOM, Zugriffskontrolle, Verschlüsselung, Vorfallkontakt, relevante aktuelle Prüfberichte |
| Entscheidung | Freigegeben/gesperrt, Freigebende, Datum, Umfang, Wiedervorlage |

Auszufüllen für Hetzner, OpenAI, Google Gemini, Hugging Face, Wolfram, Ideogram, Resend und Stripe. Google Analytics/Ads gehören nur in das getrennte Verzeichnis der öffentlichen Website; für den Schulmodus sind sie nicht vorgesehen.

**Entscheidungsregel:** Ein Anbieter bleibt für personenbezogene Schulverarbeitung gesperrt, solange Minderjährigeneignung, Vertragsrolle oder Transfer-/Speicherbedingungen ungeklärt sind. Ein technisch erreichbarer Dienst ist kein freigegebener Dienst. Für Gemini ist wegen der aktuellen Bedingungen eine besondere Klärung beziehungsweise Alternative nötig. [Gemini API](https://ai.google.dev/gemini-api/terms).

## F. Löschkonzept – auszufüllende betriebliche Tabelle

Die im Prüfbericht enthaltene Zuordnung zur aktuellen Anlage 1 BaySchO ist maßgebliche Arbeitsgrundlage. Keine allgemeine „30 Tage für alles“-Regel einführen. Für jede Datenklasse ist der früheste einschlägige Zweckfortfall beziehungsweise gesetzliche Endpunkt zu bestimmen.

| Datenklasse | Rechtlicher Endpunkt | Technischer Auslöser | Verantwortliche | Nachweis |
|---|---|---|---|---|
| Schulkonto/Profil | [Kategorie, Austritt, ggf. Einschränkungsphase] | [Austrittsereignis mit Datum] | [Schule/Betrieb] | Konto und Sitzungen gesperrt, anschließend gelöscht |
| Kurs-/Lernplattformdaten | [Qualifikationsstufe/Schulbesuch/sonstige Regel] | [Schulart und Abschlussdatum] | [Eintrag] | Hauptdaten, Ableitungen und Freigaben entfernt |
| Gruppe/Projekt | [Ende Projekt/Gruppe/Schuljahr, Sonderregel] | [Ereignis] | [Eintrag] | Geteilte Inhalte und KV-Aufgaben einbezogen |
| Audio und Transkript | [Rechtsgrundlage und Zweckende separat] | [Gespräch beendet/Bewertung fertig] | [Eintrag] | Lokale, Server- und Providerkopien berücksichtigt |
| Protokolle | [Notwendige Frist unter gesetzlicher Höchstgrenze] | [Zeitstempel] | [Eintrag] | Rotation + Inhaltsminimierung + Alarm bei Ausfall |
| Hintergrundaufträge | [Kurze Frist auch bei Fehler] | [Abschluss/Fehlschlag/Kontolöschung] | [Eintrag] | Kein Wiederanlegen gelöschter Ergebnisse |
| Sicherung | [Maximale verbleibende Aufbewahrung] | [Rotation; Löschregister bei Restore] | [Eintrag] | Wiederhergestellte Daten vor Freigabe erneut bereinigt |
| Anbieter | [Vertragliche Frist/technische Einstellung] | [API-Löschung/Anfrage/automatisch] | [Eintrag] | Bestätigung oder Fristnachweis; offene Fälle nachverfolgt |
| Gesetzliche Unterlagen | [Vorschrift + Dokumentart + Fristbeginn] | [Getrenntes Archiv] | [Eintrag] | Zweckbegrenzter Zugriff, kein pauschales Lernarchiv |

Abnahmetest: Ein synthetisches Konto mit Ergebnissen, Plan, Nachricht, Sitzung und Auftrag wird gelöscht. Anschließend werden Hauptdatenbank, Warteschlange, Sitzungen, Berechtigungen und lokale Speicherung geprüft. Ein währenddessen laufender Auftrag darf keine persönlichen Daten wiederherstellen. Ein Testbackup wird in isolierter Umgebung zurückgespielt; das Löschregister muss vor erneuter Nutzung greifen. Kein solcher vollständiger Test ist mit diesem Entwurf bereits bestätigt.

## G. DSFA-Risikoregister

Für jeden Eintrag müssen Betroffenenfolgen, Eintrittswahrscheinlichkeit, Schwere, Begründung, bestehende und geplante Maßnahmen, Wirksamkeitsnachweis sowie Restrisiko getrennt bewertet werden. Die folgenden Szenarien sind vorgegeben; Bewertungen sind noch offen.

| Risiko | Mögliche Betroffenenfolge | Erforderliche Maßnahme und Beleg |
|---|---|---|
| Fremde Lehrkraft oder andere Schule sieht Leistungen | Bloßstellung, falsche pädagogische Entscheidung | Mandant/Fach/Kurs/Rolle serverseitig; Negativtests |
| Privater Lernverlauf wird zum Pflicht-Schulprofil | Erwartungsbruch, Kontroll- und Anpassungsdruck | Getrennte Konten/Zwecke; bewusste rechtlich begründete Übernahme |
| Namen/sensible Angaben gelangen in KI-Inhalte | Kontrollverlust, Offenlegung gegenüber weiteren Empfängern | Minimierung, geeigneter Dienst, Inhalts-/Dateiprüfung; pädagogische Eingaberegeln |
| Anbieter nutzt/speichert Inhalte außerhalb der vereinbarten Zwecke | Unerwartete langfristige Verarbeitung | Vertrag, Konfiguration, Providerretention und Transferbewertung |
| KI bewertet falsch oder systematisch ungleich | Benachteiligung, Fehlsteuerung des Lernens | Menschliche Prüfung, Korrekturweg, Qualitäts-/Bias-Tests nach Fach und Zielgruppe |
| Unter-18-Nutzung widerspricht Dienstbedingungen | Ungeeigneter Verarbeitungsrahmen, Funktionsausfall | Nachgewiesene geeignete Vertrags-/Produktwahl |
| Lokal gespeicherte Antworten bleiben am Schulgerät | Mitschüler können private Daten lesen | Abmeldung/Tabwechsel/Cache/Browserprofile mit Schulgeräten testen |
| Löschung scheitert oder Daten kehren aus Backup zurück | Unbefristete Speicherung gegen Betroffenenwunsch | Überwachtes Löschverfahren, Wiederholbarkeit, Restore-Abgleich |
| Konto wird gesperrt/gelöscht, Sitzung bleibt aktiv | Weiterer Zugriff trotz Widerruf | Einheitliche Sperrprüfung, Ablauf offener Verbindungen |
| KI- oder Serverausfall im Pflichtunterricht | Unterrichtsteilnahme beeinträchtigt | Geeignete Alternative, Wiederanlauf und Support |

Nach Umsetzung: Restrisiken neu bewerten, DSB-Rat dokumentieren und gegebenenfalls Betroffenenvertretungen beteiligen. Bei verbleibendem hohem Risiko Art. 36 prüfen. Die Entscheidung trifft die jeweils verantwortliche Stelle, nicht der automatische Testlauf. [BayLfD KI-Orientierung](https://www.datenschutz-bayern.de/ki/OH_KI.pdf).

## H. Verfahren für Rechteanfragen und Vorfälle

### Betroffenenrechte

1. Eingang unter [Kontakt] erfassen; betroffene Schule/Verarbeitung und Verantwortlichkeit bestimmen.
2. Identität verhältnismäßig prüfen; keine pauschale Ausweiskopie verlangen, wenn eine weniger eingreifende sichere Prüfung ausreicht.
3. Monatliche Regelantwortfrist nach Art. 12 Abs. 3 erfassen. Etwaige zulässige Verlängerung rechtzeitig begründen und mitteilen.
4. Alle einschlägigen Systeme und Empfänger abfragen. Daten Dritter und geschützte Geheimnisse angemessen berücksichtigen.
5. Fehler nicht als „keine Daten vorhanden“ ausgeben. Berichtigung, Löschung oder Einschränkung über alle betroffenen Systeme nachhalten; Art. 19 prüfen.
6. Sicher antworten, Ergebnis und gegebenenfalls rechtliche Ablehnung dokumentieren; Beschwerde- und Rechtsbehelfshinweise beachten.

### Datenschutzvorfälle

1. Zugang begrenzen, laufende Offenlegung stoppen, relevante Beweise datensparsam sichern.
2. Betreiber informiert die verantwortliche Schule unverzüglich; keine vollständige Forensik abwarten, wenn schon eine Verletzung bekannt ist.
3. Schule/Verantwortlicher bewertet Art, Umfang und Risiko. Meldung an die Aufsicht, soweit erforderlich, möglichst binnen 72 Stunden nach Bekanntwerden; verspätete Meldung begründen. Fehlende Informationen können nachgereicht werden.
4. Bei voraussichtlich hohem Risiko Benachrichtigung der Betroffenen nach Art. 34 prüfen; Ausnahmen und Inhalt dokumentieren.
5. Auch nicht gemeldete Verletzungen dokumentieren; Ursache beseitigen, Wirksamkeit prüfen, Verfahren nachbessern.

Eine bloß mögliche Schwachstelle ist nicht automatisch ein festgestellter Vorfall. Die Entscheidung muss jedoch geprüft und begründet werden, statt eine Lücke nur still zu schließen.

## I. Entwurf einer kurzen Information für Lernende und Eltern

**Noch nicht zur Ausgabe bestimmt. Erst nach Ersetzung aller Platzhalter und Abgleich mit dem freigegebenen Betrieb verwenden.**

> Unsere Schule [Name] möchte myAbiFlow für [konkreter Lernzweck/Fächer/Jahrgänge] einsetzen. Verantwortlich ist [Schule, Anschrift, Kontakt]. Unsere Datenschutzbeauftragte/unser Datenschutzbeauftragter ist unter [Kontakt] erreichbar.
>
> Du erhältst ein schulisches Konto mit [Pseudonym/Schulkennung]. Verarbeitet werden [genaue Datenarten]. Deine zuständige Lehrkraft sieht [genauer Umfang]. Andere Schülerinnen und Schüler sehen [Umfang oder keine persönlichen Ergebnisse]. Die private Nutzung außerhalb dieses Schulangebots wird [Abgrenzung] behandelt.
>
> [Genau benannte KI-Dienste] erzeugen Rückmeldungen. Dafür erhalten sie [Daten und Verarbeitungsorte]. KI kann Fehler machen. Bei unverständlichen oder falschen Rückmeldungen wende dich an [Ansprechperson]. KI-Ergebnisse werden [menschlicher Prüfweg]; sie entscheiden nicht allein über deine Schulnote.
>
> Die schulische Verarbeitung beruht auf [konkrete Rechtsgrundlage und Erforderlichkeit]. Für [freiwillige Zusatzfunktion] gilt eine getrennte freiwillige Entscheidung ohne Nachteil bei Ablehnung. Werbung und Werbetracking sind im Schulangebot nicht enthalten. Eine private E-Mail-Adresse und ein eigenes Bezahlkonto sind nicht erforderlich.
>
> Deine Daten werden nach [konkrete Fristen, ggf. je Kategorie] gelöscht. Bitte gib keine privaten Angaben über andere Menschen und keine unnötigen sensiblen Informationen ein. Auf gemeinsam genutzten Geräten melde dich nach jeder Nutzung ab.
>
> Du beziehungsweise deine berechtigte Vertretung kannst unter den gesetzlichen Voraussetzungen Auskunft, Berichtigung, Löschung, Einschränkung und weitere Rechte verlangen. Kontakt: [Schule]. Die vollständigen Informationen einschließlich Empfänger, Drittlandgrundlagen, Rechte und Beschwerdemöglichkeit findest du unter [barrierefrei zugänglicher Link]. Für die öffentliche Schule ist der BayLfD die zuständige Datenschutzaufsicht.

Der Kurztext benötigt eine vollständige Information nach Art. 13/gegebenenfalls 14. Er ist keine Einwilligungserklärung und kann fehlende Verträge oder eine fehlende schulrechtliche Grundlage nicht ersetzen.

## J. Abnahmeprotokoll vor verbindlichem Start

- [ ] Rechtsgrundlage, Erforderlichkeit und Datenkategorien für die konkrete Schule festgehalten.
- [ ] KI-Anbieter und Ersatzdienste für Minderjährige sowie die jeweilige Verarbeitung nachweislich geeignet.
- [ ] Wirksamer Schul-AVV mit vollständigen Anlagen und geprüfter Unterauftragnehmerkette.
- [ ] Vollständige Empfänger-/Drittland-/Speichernachweise liegen vor.
- [ ] Schulmodus isoliert Konten und Daten; Schule organisiert Zugänge ohne Privatkauf/-E-Mail.
- [ ] Berechtigungs-, Austritts-, Sperr-, Export-, Lösch- und Wiederherstellungstests bestanden.
- [ ] Keine Tracker oder werblichen Datenflüsse im Schulbereich, auch bei alter Einwilligung.
- [ ] DSFA abgeschlossen, DSB-Rat dokumentiert, etwaige Konsultation erledigt.
- [ ] VVT und TOM entsprechen der tatsächlichen Produktversion.
- [ ] Informationen für Lernende/Eltern verständlich, vollständig und zugänglich bereitgestellt.
- [ ] KI-Zweckbestimmung, Transparenz und menschliche Kontrolle geregelt.
- [ ] Rechteanfragen, Vorfälle, Support, Vertretung und regelmäßige Kontrollen organisatorisch besetzt.
- [ ] Weitere schulische Beschaffungs-, Beteiligungs- und Zugänglichkeitsanforderungen geprüft.
- [ ] Entscheidung mit offenen Restrisiken, Umfang, Datum und verantwortlicher Person dokumentiert.

**Aktueller Status:** Diese Abnahme ist noch offen. Ein Vertrag allein oder ein technisch erfolgreicher Test ersetzt die übrigen Punkte nicht.
