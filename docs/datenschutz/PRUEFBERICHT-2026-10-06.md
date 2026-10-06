# Datenschutzprüfung myAbiFlow für den verbindlichen Unterricht in Bayern

**Stand: 6. Oktober 2026 · Entscheidung: noch nicht für den verbindlichen Schulbetrieb abnahmefähig.**

Die Website wurde technisch verbessert und mehrere konkret nachgewiesene Zugriffslücken wurden geschlossen. Damit sind die wesentlichen rechtlichen und organisatorischen Voraussetzungen eines verpflichtenden Schuleinsatzes noch nicht erfüllt. Dieses Dokument ist eine technische und rechtliche Arbeitsprüfung anhand amtlicher Quellen, keine behördliche Zulassung oder anwaltliche Freigabe.

## 1. Auftrag, Annahmen und Prüfgrenzen

Der Betreiber möchte myAbiFlow auch verbindlich im Unterricht in Bayern einsetzen. Nach seiner Auskunft liegen bislang keine zusammengestellten AV-Verträge, keine Prüfung durch Datenschutzbeauftragte und keine besondere Google-Vereinbarung für Minderjährige vor. Das bedeutet nicht automatisch, dass keinerlei online einbezogene Anbieterbedingungen gelten. Ihre konkrete Geltung und Eignung müssen nachgewiesen werden.

Schulart und erste Partnerschule sind noch nicht festgelegt. Wegen des Produktumfangs wurden Gymnasium und FOS/BOS mitbetrachtet. Die schulrechtliche Bewertung geht zunächst von einer öffentlichen bayerischen Schule aus; bei privaten Schulen sind Trägerschaft, Rechtsgrundlage und Aufsicht gesondert zu bestimmen.

Geprüft wurden:

- Aktueller GitHub-Hauptzweig, zentrale Frontenddateien, Schüler-/Lehrkraft-/Administrationszugriffe, Ergebnisse, Profile, Lernpläne, Nachrichten, Kontolöschung, Selbstexport, KI-Schnittstellen, Hintergrundaufträge, Echtzeitproxy und Tutor sowie die öffentlichen Rechtstexte.
- Statische Ressourcenverweise in 117 HTML-Quelldateien. Dynamische Einbindungen wurden zusätzlich in gemeinsamem JavaScript und im Browser untersucht.
- Live-Netzwerkverhalten von neun repräsentativen Seiten jeweils mit abgelehnter und gespeicherter erteilter Einwilligung. Keine Anmeldung an realen Schülerkonten, keine Erzeugung echter KI-Aufträge und keine Löschung realer Daten.
- Ausgewählte Produktionskonfiguration: Dienststatus, Bindung von Datenbank/Redis, Firewall, Logrotation, Sicherungsdateien und Datenbankschema. Lösch-SQL wurde mit EXPLAIN in einer schreibgeschützten Transaktion geprüft.
- Aktuelle amtliche Schulrechtsquellen, Datenschutz-Orientierungshilfen und relevante Anbieterbedingungen. Einige amtliche Seiten waren im Web-Lesezugriff zeitweise nicht erreichbar; die aktuelle vollständige Anlage 1 BaySchO wurde deshalb zusätzlich direkt vom amtlichen Server abgerufen.

Nicht nachgewiesen sind insbesondere tatsächliche Verträge und Kontoeinstellungen bei allen Dienstleistern, lückenlose historische Datenflüsse, ein vollständiger Penetrationstest, eine Wiederherstellungsübung, tatsächliche Löschung beim Empfänger, alle Browser und sämtliche Fachabläufe. Ein erfolgreicher Test einzelner Kontrollen bedeutet keine vollständige DSGVO-Konformität.

## 2. Bereits umgesetzt und veröffentlicht

| Änderung | Wirkung | Verifikation |
|---|---|---|
| Persönliche Schülerzugriffe strenger gebunden | Freie Namensangaben ersetzen nicht die angemeldete Identität; private Einstellungen, Postfach, Profile und Pläne sind nicht allgemein für Lehrkräfte offen | Negativtests mit getrennten synthetischen Personen und Rollen |
| Ergebnisdetails nach Person und Fach geprüft | Eine Lehrkraftverknüpfung erlaubt keinen Abruf beliebiger fremder Ergebnisse oder anderer Fächer | Eigene/fremde Person und eigenes/fremdes Fach getestet |
| Kursverknüpfungen benötigen persönlichen Login | Gruppentoken können keine beliebigen Namen verknüpfen oder deren Codes abrufen | Gefälschte Namen und Gruppenzugang getestet |
| Asynchrone Korrekturaufträge an Ersteller gebunden | Konto beziehungsweise Sitzung muss zum Auftrag passen; interne Eigentümerdaten gehen nicht an KI-Handler | Schüler, Lehrkraft, andere Sitzung, Altauftrag und Datenweitergabe getestet |
| Gesprächssitzungen und Transkripte geschützt | Session-Erstellung verwendet die geprüfte Konto-ID; Status, Transkript und Session-WebSocket prüfen den aktiven Eigentümer | Anonymer Zugriff, anderes/gelöschtes Konto, gefälschte ID, alte Sitzung und WebSocket getestet |
| API- und Offline-Speicherung begrenzt | JSON der Haupt-API und Session-Antworten mit no-store; Service Worker nur für erlaubte öffentliche statische Dateien | 11 Cache-Fälle, Live-Header |
| Kontolöschung transaktional | Zusammengehörige Datenbanklöschung wird bei Fehlern zurückgerollt; vorher übersehene Auftrags-/Nutzungsdaten einbezogen | Commit/Rollback, fehlende Voraussetzungen, SQL gegen produktives Schema |
| Tracking aus Lernbereichen entfernt | Zentraler Tracker nur auf enger öffentlicher Positivliste, mit aktueller Einwilligung und ohne erkannte Anmeldung | 12 Unit-Fälle und 18 Live-Seitenaufrufe |
| Lehrkraftsperren und Export verbessert | Nicht mehr freigegebene Lehrkraftkonten verlieren den Tokenzugriff; Exportfehler erzeugen keine Erfolgsdatei | Aktive/gesperrte Konten, Datenbankausfall und Exportfälle getestet |
| Datenschutzhinweise, TOM, DSFA und Schulangebot korrigiert | Keine pauschalen Aussagen mehr über anonymisierte KI-Inhalte, vollständige Vertragsprüfung oder abgeschlossene DSFA | Inhaltsabgleich und mobile/Desktop-Darstellung |

Änderungen sind auf GitHub und Hetzner veröffentlicht. Vorherige Serverdateien wurden gesichert. Haupt-API und Gemini-Proxy wurden neu gestartet. Alte Korrekturaufträge und Gesprächssitzungen ohne verlässlich gespeicherte Eigentümerzuordnung werden nicht nachträglich freigegeben; betroffene Übungen müssen erneut gestartet werden. Ein Neustart kann laufende Gespräche unterbrechen.

Die lokale Kontolöschung ist keine verteilte Transaktion mit Stripe und anderen Empfängern. Insbesondere kann eine externe Löschung bereits erfolgreich sein, obwohl die lokale Transaktion scheitert. Das muss im späteren Löschverfahren nachvollziehbar und wiederholbar behandelt werden.

## 3. Rechtsprüfung: verbindlicher Unterricht

### Zuständigkeit und Rechtsgrundlage

Die Schule bleibt für ihre pädagogischen Verarbeitungszwecke verantwortlich. Eine Auftragsverarbeitung verschiebt diese Entscheidung nicht auf myAbiFlow. Für notwendige öffentliche Schulaufgaben sind Art. 6 Abs. 1 Buchst. e DSGVO und die einschlägigen schulrechtlichen Befugnisse zu prüfen. Art. 85 BayEUG erlaubt erforderliche, nicht beliebige Datenverarbeitung. § 46 BaySchO und die Anlage beschreiben zulässige Verarbeitungstätigkeiten; sie ersetzen keine zusätzliche Rechtsgrundlage. [Kultusministerium](https://www.km.bayern.de/recht/datenschutz-an-schulen), [Art. 85 BayEUG](https://www.gesetze-bayern.de/Content/Document/BayEUG-85), [§ 46 BaySchO](https://www.gesetze-bayern.de/Content/Document/BaySchO2016-46).

**Anwendung auf myAbiFlow:** Für jedes Modul ist zu begründen, warum es für die konkrete Unterrichtsaufgabe erforderlich ist. Eine bezahlte Schullizenz oder ein Klassen-Code beantwortet diese Frage nicht. Das Unternehmensinteresse an Produktentwicklung oder Werbung darf nicht als schulischer Unterrichtszweck behandelt werden. Private Übungsdaten dürfen nicht ohne eigene Grundlage zu schulischen Leistungsdaten werden.

Eine Einwilligung ist bei einer verpflichtenden Teilnahme kein geeignetes pauschales Fundament. Für tatsächlich freiwillige Zusatzfunktionen wären getrennte Wahl, Information, Widerruf und eine nachteilsfreie Alternative nötig. Art. 8 DSGVO ist kein allgemeines Verbot jeder digitalen Nutzung unter 16; er betrifft die dort geregelte einwilligungsbasierte Konstellation. Vertragsbedingungen von KI-Anbietern sind davon unabhängig einzuhalten.

### Aktuelle Anlage 1 BaySchO, Abschnitt 2 „Pädagogische Tätigkeit“

Die maßgebliche Anlage heißt in der seit 1. August 2026 geltenden Fassung **Anlage 1**. Ältere Dokumente mit „Anlage 2“ oder rein softwarebezogenen alten Abschnittsnummern dürfen nicht ungeprüft übernommen werden. Die amtliche Gesamtfassung und der vollständige aktuelle Abschnitt wurden abgeglichen. Die folgende Zuordnung ist eine fachliche Arbeitszuordnung; die Schule muss sie je Datenfeld bestätigen. [Aktuelle Anlage 1](https://www.gesetze-bayern.de/Content/Document/BaySchO2016-ANL_1).

| Daten/Funktion bei myAbiFlow | Bezug in Abschnitt 2 | Konsequenz für die Umsetzung |
|---|---|---|
| Konto, Rolle, Profil, gespeicherte persönliche Dateien/Einstellungen | Insbesondere 3.3.3.1 und 3.3.3.3, Kennzeichnung 3 | Spätestens drei Monate nach Verlassen der Schule; vorgesehene zusätzliche Wiederherstellung nur unter den normierten Einschränkungen und ohne Löschverlangen. Kein unbegrenztes Privatkonto als schulischer Standard. |
| Login-/Nutzungsprotokolle, IP, Sitzungskennungen | 3.3.3.2 beziehungsweise Personal 3.1.3.2, Kennzeichnung 2 | Höchstens drei Monate ab Erhebung; kürzere notwendige Frist bevorzugen. 180-Tage-Aktivierungsereignisse auf Datenart/Zweck prüfen. |
| Kursmitgliedschaft, bearbeitete Lektionen, Testauswertung, Korrekturanmerkungen | 3.3.3.1 Buchst. c und 3.3.3.6, Kennzeichnung 5 | Für die zweijährige gymnasiale Qualifikationsstufe Ende der Qualifikationsstufe; für Berufliche Oberschulen spätestens Ende des Schulbesuchs. Andere Jahrgänge anhand der anwendbaren Grundregel prüfen. |
| Gruppenchat, gemeinsam bearbeitete oder geteilte Inhalte | 3.3.3.5, Kennzeichnung 4 | Projekt-/Gruppen-/Schuljahresende zuordnen; besondere Endpunkte für Qualifikationsstufe und Berufliche Oberschule beachten. |
| Live-Bild, Bildschirm und Ton bei Kommunikation | 3.3.3.4, Kennzeichnung 1 | Keine Speicherung nach dieser Kategorie. Eine Aufnahme darf nicht unter bloßer Livekommunikation versteckt werden. |
| Pädagogische Bild-/Tonaufnahme | 3.3.2.1 Buchst. e, Kennzeichnung 6; Art. 85 Abs. 1b BayEUG | Unverzüglich nach Aufgabenerledigung löschen, soweit keine andere Rechtsgrundlage für weitere Verarbeitung besteht. Provider-Sicherheitsaufbewahrung und lokale Backups müssen dazu gesondert geprüft werden. |
| Sonstige Daten ohne besondere Kennzeichnung | Nr. 5 Satz 2 | Normierten Endpunkt am 30. September des nachfolgenden Schuljahres nach letzter Verarbeitung beziehungsweise Ausscheiden abbilden; nicht durch jeden technischen Zugriff künstlich verlängern. |
| Tatsächliche Schülerunterlagen/Leistungsnachweise | Nr. 5 Satz 1; §§ 37–40 BaySchO | Eigenständige Aufbewahrungsregeln; Übungsfeedback nicht automatisch als amtlichen Leistungsnachweis einstufen. Vor einer Prüfungsnutzung verbindlich abgrenzen. |

**Befund:** Das gegenwärtige allgemeine Konto- und Ergebnismodell hat weder schulbezogene Austrittsdaten noch die erforderlichen differenzierten Endpunkte. Die vorhandenen täglichen Bereinigungen beheben diese Lücke nicht. Die Anlage ist außerdem kein Auftrag, sämtliche dort aufgeführten Daten zu sammeln: myAbiFlow benötigt zum Beispiel weder Geburtsort noch Religionszugehörigkeit, nur weil diese in einer schulischen Datenkategorie stehen.

Für Sprachübungen ist die Unterscheidung zwischen Liveübertragung, Aufnahme, Transkript und daraus abgeleiteter Bewertung besonders wichtig. Eine pauschale Aussage „Audio wird nicht gespeichert“ ist ohne Prüfung aller Empfänger unzureichend. [Art. 85 Abs. 1b BayEUG](https://www.gesetze-bayern.de/Content/Document/BayEUG-85).

## 4. Anforderungsmatrix

**Offen** bedeutet fehlende Grundlage, Umsetzung oder Nachweis. **Teilweise** bedeutet vorhandene Einzelmaßnahmen ohne vollständige Abnahme. **Verbessert** ist ein konkreter technischer Fortschritt, keine Gesamtkonformität.

| Nr. | Prüfpunkt | Maßstab | Stand und erforderliche Abnahme |
|---|---|---|---|
| 01 | Verantwortliche je Zweck | Art. 4 Nr. 7/8, 24, 28 DSGVO | Offen: private Nutzung, Schulauftrag, Sicherheit, Zahlung und Werbung getrennt dokumentieren. |
| 02 | Unterrichtszweck und Erforderlichkeit | Art. 5/6 DSGVO, Art. 85 BayEUG | Offen: konkrete Schule und Funktion begründen; keine allgemeine Einwilligung als Ersatz. |
| 03 | Zulässige schulische Datenarten | § 46, Anlage 1 BaySchO | Offen: Datenfeldzuordnung und Abweichungen dokumentieren. |
| 04 | Datenminimierung | Art. 5 Abs. 1 c, 25 DSGVO | Teilweise: Pseudonyme möglich; verpflichtendes E-Mail-Privatkonto und detaillierte Leistungsprofile vermeiden. |
| 05 | Zweckbindung | Art. 5 Abs. 1 b, 28 DSGVO | Offen: Schulauftragsdaten nicht für eigene Werbung/Training/Produktanalysen verwenden. |
| 06 | Freiwillige Zusatzangebote | Art. 7/8 DSGVO | Teilweise: getrennte E-Mail-/Trackingwahl vorhanden; Alter, Einwilligungsfähigkeit und schulischer Kontext nicht abschließend gelöst. |
| 07 | Besondere Daten | Art. 9 DSGVO | Offen: Freitext-/Bild-/Sprachinhalte und Inferenzrisiken begrenzen; bloßer Hinweis genügt nicht. |
| 08 | Verständliche Information | Art. 12–14 DSGVO | Verbessert: öffentliche Texte korrigiert. Schulbezogene Kinder-/Elterninformation und vollständige Empfängerdetails fehlen. |
| 09 | Auskunft/Kopie | Art. 15 DSGVO | Verbessert: Selbstexport enthält nun auch Feedback und Einwilligungsangaben; Abfragefehler brechen ihn sichtbar ab. Vollständige systemübergreifende Auskunft bleibt separat sicherzustellen. |
| 10 | Berichtigung | Art. 16, 19 DSGVO | Offen: fehlerhafte Profile/Bewertungen berichtigen und erforderlichenfalls Empfänger informieren. |
| 11 | Löschung | Art. 17/19 DSGVO | Verbessert in der Hauptdatenbank; externe Dienste, laufende Jobs, Sitzungen und Backups noch kein geschlossenes Verfahren. |
| 12 | Einschränkung | Art. 18 DSGVO | Offen: Daten für Streitfälle sperren statt nur weiterverwenden oder löschen. |
| 13 | Datenübertragbarkeit | Art. 20 DSGVO | Teilweise: JSON vorhanden; Anwendbarkeit abhängig von Rechtsgrundlage, nicht pauschal jeder schulische Datensatz. |
| 14 | Widerspruch/Widerruf | Art. 7 Abs. 3, 21 DSGVO | Teilweise: Tracking/E-Mail bedienbar; allgemeiner Bearbeitungsablauf fehlt. Kein automatischer Kontolöschzwang. |
| 15 | Automatisierte Entscheidungen | Art. 22 DSGVO | Offen: tatsächliche Wirkung der Bewertungen prüfen, menschliche Kontrolle und Anfechtung vorsehen. |
| 16 | Schul-AVV | Art. 28 Abs. 3 DSGVO | Offen: konkrete Leistung, Weisungen, Löschung, TOM, Kontrolle, Unterstützung und Kontakte vereinbaren. |
| 17 | Unterauftragnehmer | Art. 28 Abs. 2/4 DSGVO | Offen: vollständiges Register, Genehmigung/Änderungsmechanismus und durchgängige Pflichten. |
| 18 | Drittlandverarbeitung | Art. 44–49 DSGVO | Offen: konkrete Empfänger, Fernzugriffe, DPF-Anwendungsbereich oder SCC/TIA und Zusatzmaßnahmen prüfen. |
| 19 | Sichere Voreinstellungen | Art. 25 DSGVO | Verbessert: Trackingausschluss und Cache. Vollständiger Schulmodus fehlt. |
| 20 | Mandanten- und Rollenrechte | Art. 5 Abs. 1 f, 32 DSGVO | Teilweise: mehrere Zugriffe gehärtet; globale Konten/Verknüpfungen ersetzen keine Schultrennung. |
| 21 | Administratoren/Support | Art. 29/32 DSGVO | Offen: personenbezogene Adminrollen, MFA, minimale Rechte, Supportfreigabe und Protokollierung. |
| 22 | Sitzungssicherheit | Art. 32 DSGVO | Verbessert für Haupt-API und Session-Routen; unmittelbarer Widerruf für alle Proxy-/Tutorpfade bleibt offen. |
| 23 | Transport/Geheimnisse | Art. 32 DSGVO | Teilweise: HTTPS und signierte Token. Schlüsseltrennung, Rotation, URL-Token und Logging gesondert abschließen. |
| 24 | Verfügbarkeit/Backup | Art. 32 Abs. 1 b–d DSGVO | Teilweise: verschlüsselte Sicherungen vorhanden; Restore, Schlüsselwiederherstellung und Löschabgleich unbewiesen. |
| 25 | Löschfristen | Art. 5 Abs. 1 e, BaySchO | Offen: verbindliche Schulfristen, Providerretention und überwachte Durchführung. |
| 26 | VVT | Art. 30 DSGVO | Offen: Verantwortlichen- und Auftragsverarbeiterverzeichnis getrennt vervollständigen; regelmäßiger Betrieb nicht pauschal durch Kleinbetriebsregel ausgenommen. |
| 27 | DSFA | Art. 35 DSGVO | Offen: vollständige Beschreibung, Verhältnismäßigkeit, Risiken, Maßnahmen, verbleibendes Risiko und DSB-Rat dokumentieren. |
| 28 | Vorherige Konsultation | Art. 36 DSGVO | Bedingt: erforderlich, wenn trotz Maßnahmen hohes Risiko verbleibt; erst nach nachvollziehbarer Bewertung entscheiden. |
| 29 | Datenschutzorganisation | Art. 37–39 DSGVO, § 38 BDSG | Offen: Pflicht zur DSB-Benennung prüfen; DSFA-pflichtige Verarbeitung kann unabhängig von 20 Beschäftigten relevant sein. |
| 30 | Datenschutzvorfälle | Art. 33/34 DSGVO | Offen: internes Verfahren, Bewertung, Meldung/Benachrichtigung und Beweissicherung. Festgestellte Schwachstelle ist noch kein nachgewiesener Datenabfluss. |
| 31 | Browserzugriffe/Tracking | § 25 TDDDG, Art. 6/7 DSGVO | Verbessert: Trennung technisch geprüft; öffentliche Anbieter-/Einwilligungsnachweise noch vollständig archivieren. |
| 32 | Werbliche E-Mails | § 7 UWG, Art. 6/7 DSGVO | Teilweise: Opt-in vorhanden; Versandarten und Nachweis/Widerruf kontrollieren. Vertragsmails dürfen keine verkappte Werbung sein. |
| 33 | Impressum | § 5 DDG, ggf. § 18 Abs. 2 MStV | Veraltete TMG/RStV-Verweise korrigiert. Unternehmens-/Registerangaben wurden nicht neu registerrechtlich verifiziert. |
| 34 | KI-Verordnung | Art. 5, 6, 50 und Anhang III | Offen: Zweckbestimmung, Rollen, Bildungsbewertung, Transparenz und Dokumentation fachkundig einstufen. |
| 35 | Schuleinführung/Barrierefreiheit | Schulische Organisation; ggf. BayBGG/BayBITV/BFSG | Keine Vollprüfung: nur mobile Darstellung/bedienbare Datenschutzkontrollen. Anwendbarkeit, Beschaffung, Personalvertretung und weitere schulische Vorgaben separat abklären. |

Die DSGVO-Pflichten sind zusammen zu lesen. Die amtliche Orientierungshilfe des BayLfD behandelt insbesondere Verantwortlichkeit, Rechtsgrundlagen, Informationspflichten, Betroffenenrechte, DSFA und Drittlandtransfer bei KI. [BayLfD, März 2026](https://www.datenschutz-bayern.de/ki/OH_KI.pdf). Für Anbieterorganisation und ergänzende Einzelpflichten: [§ 38 BDSG](https://www.gesetze-im-internet.de/bdsg_2018/__38.html), [§ 25 TDDDG](https://www.gesetze-im-internet.de/ttdsg/__25.html), [§ 7 UWG](https://www.gesetze-im-internet.de/uwg_2004/__7.html), [§ 5 DDG](https://www.gesetze-im-internet.de/ddg/__5.html).

## 5. Tatsächliche Datenflüsse und Anbieterprüfung

| Dienst/Speicher | Daten laut untersuchtem Code | Offener Nachweis vor Schuleinsatz |
|---|---|---|
| Browser | Login, Entwürfe, Aufgaben, Antworten, Einstellungen, Einwilligungen und lokale Wiederherstellung | Shared-Device-Tests, Löschung bei Konto-/Tabwechsel, Offlineverhalten, Datensparsamkeit |
| Hetzner/PostgreSQL | Konten, Leistungen, Profile, Nachrichten, Jobs, Lizenzen, Zahlungsreferenzen | Kundenbezogener AVV, Subprozessoren/Standorte, Zugriff, Sicherungen und Löschverfahren |
| Redis/Queue/KV | Sitzungszustände, Transkripte, Auftragskennungen und Aufgabenmaterial | TTL/Löschung auch bei Fehlern, laufenden Jobs und Kontolöschung; keine unbefristeten Fehleraufträge |
| OpenAI | Aufgaben, Texte, Bilder; für Pläne/Profile auch Punktzahlen und Leistungsentwicklung | Kontovertrag, verwendete Endpunkte/Modelle, Region, Sicherheitsretention, Trainingseinstellungen, Minderjährige, Transfergrundlage |
| Google Gemini | Text-/Bildkontext, Tutor, Liveaudio/Transkripte | Vor allem geeignete Minderjährigen-/Produktbedingungen; Paid-Service-Konfiguration, Regionen, Sicherheitsaufbewahrung und Auftragsverarbeitung |
| Hugging Face | Tutorfragen zur Einbettung/Suche | Drittanbieterweg vermeiden oder vollständig vertraglich und technisch abnehmen; Filter ist keine Anonymisierung |
| Wolfram | Prüfaufträge/Formeln/fachlicher Text | Persönlichen Freitext technisch ausschließen oder geeignete Verarbeitungskette nachweisen |
| Ideogram | Bildauftrag/fachlicher Kontext als Ausweichdienst | Ersatzanbieter gehört ebenfalls in Freigabe, Unterauftragnehmerliste und Transferprüfung |
| Resend | Empfänger, Anzeigename, Mailinhalte; auch betriebliche Meldungen | Tatsächliche Vertragspartei/DPA, Retention, Regionen, Löschung, minimale Fehlerbenachrichtigungen |
| Stripe | Kunde/Konto, Tarif, Vertrags- und Zahlungsstatus | Rollen pro Zweck; Schulrechnung vom Schülerkonto trennen; Aufbewahrung gesetzlicher Nachweise bestimmen |
| Google Analytics/Ads | Öffentliche Besuchs-, Verbindungs- und Cookie-Daten nach Einwilligung | Aktuelle Vertrags-/Consentnachweise; Schuleinstieg dauerhaft ohne Messung halten |

Bei pseudonymen Konten bleiben Leistungsdaten personenbezogen. Namen können auch im Text, Bild oder gesprochenen Satz stehen. Sprache ist nicht allein deshalb eine besondere Kategorie biometrischer Daten; entscheidend sind Verarbeitung und Zweck. Auch das belegte Schulfach Religion belegt nicht automatisch eine religiöse Überzeugung. Freitext kann aber Gesundheitsdaten, Überzeugungen und Angaben über Dritte enthalten.

**Gemini als unmittelbare Freigabehürde:** Die Bedingungen vom 23. März 2026 schließen API-Clients ein, die sich an Unter-18-Jährige richten oder voraussichtlich von ihnen genutzt werden. Die Einschränkung betrifft damit mehr als die Person, die den API-Schlüssel besitzt. Vor einer Schülerfreigabe ist eine passende vertraglich bestätigte Produktkonstellation oder ein anderer technischer Weg erforderlich. Eine Umstellung auf ein anderes Google-Produkt wäre neu zu prüfen und nicht automatisch eine Lösung. [Gemini-Bedingungen](https://ai.google.dev/gemini-api/terms).

**OpenAI:** Der konfigurierte globale API-Endpunkt beweist keine europäische Verarbeitung. Die offiziellen API-Regeln beschreiben standardmäßig kein Training mit API-Inhalten, aber grundsätzlich Sicherheitsprotokollierung und funktionsabhängige Ausnahmen. Regionalisierung und verringerte Aufbewahrung sind konkrete Kontofunktionen, keine aus dem Produktnamen ableitbaren Zusicherungen. [API-Datenkontrollen](https://developers.openai.com/api/docs/guides/your-data).

**Drittlandprüfung:** Deutsches Hosting allein genügt nicht. Vertrag, technische Endpunkte, Supportzugriffe und Unterauftragnehmer müssen zusammenpassen. Eine bloße DPF-/SCC-Nennung ersetzt die konkrete Prüfung nicht. [BayLfD: KI aus Drittländern](https://www.datenschutz-bayern.de/datenschutzreform2018/aki60.html). Für Resend ist beispielsweise die geltende Einbeziehung des [DPA](https://resend.com/legal/dpa) im tatsächlichen Konto zu dokumentieren.

## 6. Speicherung: heutiger Stand und Lücken

| Bereich | Heutiger technischer Stand | Noch erforderlich |
|---|---|---|
| Konten/Ergebnisse/Profile | Im Wesentlichen bis Kontolöschung | Schulart-/Datenkategorie-/Austrittsfristen und früherer Zweckfortfall |
| Asynchrone Korrekturdaten | Bereinigungsschwelle 24 Stunden | Erfolgreiche Ausführung überwachen; keine Zusicherung „spätestens 24 h“ ohne Laufintervall |
| Lernpläne | Bereinigung nach expires_at | Plan und abgeleitete Profile bei Wegfall des Zwecks vollständig behandeln |
| Sessionzustand | Redis grundsätzlich 1 Stunde, laufende Sitzung prüfen | Aktive Verbindung/TTL/Neuanlage nach Löschung verhindern; Providerretention separat |
| Kolloquiumsmetadaten | 30-Tage-Schwelle | Notwendigkeit und Abgrenzung zu Inhalt/Audio |
| Aktivierungsereignisse | 180-Tage-Schwelle | Im Schulmodus kein eigener Anbieterzweck; BaySchO-Protokollkategorie prüfen |
| Nachrichten/Feedback | 365-Tage-Schwelle | Zweck-/Schulfristen; anonyme Produktmeldung von personenbezogener Kommunikation trennen |
| Passwort-/Verifikationstoken | 24 Stunden beziehungsweise 7 Tage/Benutzung | Erfolgreiche Läufe und Schutz vor Wiederverwendung belegen |
| Redis-Auftragswarteschlange | Erfolgreiche Jobs bis 30 Tage; fehlgeschlagene Jobs ohne allgemeines Ablaufdatum | Begrenzte Fehleraufbewahrung, Dateninventar und verlässliche Löschzuordnung |
| KV-Aufgaben | Kein allgemeines Ablaufverfahren im Adapter erkennbar | Lehrer-/Kurs-/Projektlöschung und Materialfristen |
| Webserverlogs | Täglich 14 rotierte Dateien plus aktuelle Datei | Tatsächliche Inhalte, Tokenbereinigung, Anwendungslogs und Sicherheitsausnahmen |
| Backups | Konfiguration 7 täglich, 4 wöchentlich, 3 monatlich; verschlüsselte Dateien vorhanden | Wiederherstellung testen; Löschregister vor Wiederinbetriebnahme anwenden; Remote-Kopien/Schlüssel und Rotation belegen |
| Browserdaten | Bereinigung beim erneuten Aufruf/Abmelden; nicht bei ausgeschaltetem Browser | Gemeinsam genutzte Geräte, mehrere Tabs und mehrere Profile realistisch testen |
| Anbieter | Unterschiedliche, noch nicht abschließend dokumentierte Fristen | Nicht mit lokalen Fristen gleichsetzen; verbindliche Nachweise und technische Einstellungen |

Die zentrale Datenschutzbereinigung fängt derzeit einzelne Fehler ab und protokolliert nur die Zahl erfolgreicher Anweisungen. Ohne dauerhafte Alarmierung könnte eine Tabelle unbemerkt zu lange speichern. Die Gesundheitsprüfung direkt nach Neustart zeigt noch keinen neuen erfolgreichen täglichen Bereinigungslauf; daraus darf kein abgeschlossener Löschtest abgeleitet werden.

## 7. Noch offene technische Arbeiten

1. **Eigenständiger Schulmodus:** Schul-ID auf allen personenbezogenen Objekten; stabile Konto-ID statt Namensabgleich; Rollen und Kurs-/Fachzuordnung; keine privaten Käufe oder E-Mail-Pflicht. Eine technisch durchgesetzte Anbieter-Positivliste muss verhindern, dass ein ungeprüfter Ausweichdienst personenbezogene Schulinhalte erhält.
2. **Durchgängiger Sitzungswiderruf:** Die Haupt-API und Session-Routen prüfen persönliche Konten. Lehrkrafttoken prüfen nun den weiterhin freigegebenen Kontostatus. Generische Proxy-/Tutorpfade müssen Kontolöschungen ebenfalls beachten; Passwortwechsel und weitere Sitzungswiderrufe bleiben dienstübergreifend umzusetzen. Auch bereits offene Verbindungen sind einzubeziehen.
3. **Administration:** Globale Kennwortzugänge durch individuelle, eng begrenzte Administratorrollen ersetzen; MFA, Protokollierung und kontrollierte Supportfreigabe. Dienste laufen derzeit mit weitreichenden Betriebssystemrechten; getrennte eingeschränkte Dienstkonten vorsehen.
4. **Export und Auskunft:** Der Selbstexport wurde um Feedback, Einzelwerte und Einwilligungsnachweise ergänzt; Abfragefehler führen nun zu einer sichtbaren Fehlermeldung statt zu einer unvollständigen Erfolgsdatei. Weitere Datengruppen und externe Empfänger müssen für eine vollständige Auskunft noch einbezogen werden; interne Zugangsschlüssel und Daten Dritter ausnehmen. Fehler dürfen keine scheinbar vollständige Auskunft erzeugen.
5. **Löschung über alle Systeme:** Laufende Jobs zuerst sperren, Sitzungen beenden, externe Löschung nachhalten, Sicherungen und Wiederherstellung berücksichtigen. Wiederholbarer Prozess mit Fehlerstatus statt bloßem Erfolgsdialog.
6. **Protokolle minimieren:** Keine vollständigen Anfragen, Antworten, Schülertexte oder Zugangstoken in Fehlerprotokollen und Benachrichtigungs-E-Mails. URL-basierte WebSocket-Token müssen am Proxy und im Webserver geschützt beziehungsweise durch sichere Alternativen ersetzt werden.
7. **Schulische Abnahme:** Mehrmandantentests, Fach-/Kurswechsel, Austritt, Export, Einwilligungswiderruf, gemeinsam genutzte Geräte, Aufnahmeende und Wiederherstellung mit ausschließlich synthetischen Daten.

Die behobenen Schwachstellen rechtfertigen eine interne Prüfung, ob es Hinweise auf frühere unberechtigte Zugriffe gibt. Im Rahmen dieser Prüfung wurde kein tatsächlicher Datenabfluss nachgewiesen. Erst die dokumentierte Risikobewertung bestimmt eine etwaige Meldepflicht; nicht jede Schwachstelle ist automatisch ein meldepflichtiger Vorfall.

## 8. KI-Verordnung und pädagogische Grenzen

Eine Einstufung als unkritisch allein mit dem Satz „nur Lernhilfe“ wäre voreilig. Auswertung von Lernergebnissen und Steuerung von Lernprozessen können den Bildungsbereich des Anhangs III berühren. Anbieter- und Betreiberrolle, tatsächlicher Verwendungszweck, Profilbildung und die einschlägigen Ausnahmen müssen dokumentiert werden. Keine automatisierte Zeugnis-/Versetzungsentscheidung; keine Emotionserkennung aus Stimme oder Bild als Schulfunktion vorsehen.

Zeitstand beachten: Nach der aktuellen Mitteilung der Kommission zum in Kraft getretenen AI Omnibus beginnen die betreffenden Anhang-III-Hochrisikopflichten am 2. Dezember 2027, die produktbezogenen Anhang-I-Regeln am 2. August 2028. Das hebt bestehende Datenschutzpflichten nicht auf. Die Art.-50-Transparenzpflichten gelten grundsätzlich seit 2. August 2026; konkrete Übergänge und Rollen sind gesondert zu prüfen. [Kommission: AI Omnibus](https://digital-strategy.ec.europa.eu/en/news/ai-omnibus-enters-force), [Kommission: Art. 50](https://digital-strategy.ec.europa.eu/en/faqs/transparency-obligations-under-article-50-ai-act).

## 9. Reihenfolge bis zur schulischen Abnahme

| Priorität | Arbeit | Verantwortlich | Erledigt erst mit |
|---|---|---|---|
| Sofort | Keine Zusicherung eines bereits freigegebenen verbindlichen Schulbetriebs | Betreiber | Korrigierte Kommunikation; wurde auf den geprüften öffentlichen Seiten umgesetzt |
| Vor personenbezogenem Schulpilot | KI-Anbieterbedingungen für Minderjährige und konkrete Vertragskette klären | Betreiber mit Datenschutz-/Vertragsfachperson | Schriftlich belegter passender Dienst, wirksame Verträge und technische Konfiguration |
| Vor personenbezogenem Schulpilot | Verantwortliche Schule, Schulart, Module, Rechtsgrundlage, Datensparsamkeit | Schulleitung mit schulischem DSB | Dokumentierte Erforderlichkeit, Rollen und Verarbeitungsumfang |
| Vor personenbezogenem Schulpilot | Schulmodus und restliche Zugriff-/Löschkontrollen | Entwicklung/Betrieb | Erfolgreiche Negativtests, Fristen-/Austrittstests, Restore- und Löschprotokoll |
| Vor verbindlichem Einsatz | AVV, Unterauftragnehmer, VVT, TOM, DSFA, Information | Betreiber und Schule nach Rolle | Vollständige Unterlagen, DSB-Rat, dokumentierte Risikobehandlung; ggf. Aufsichtskonsultation |
| Vor Unterrichtsstart | Unterrichtskonzept, Einweisung, Hilfs-/Korrekturweg und Zugänglichkeit | Schule | Keine unkontrollierte KI-Benotung; Beteiligte informiert; geeignete Zugänge vorhanden |
| Laufender Betrieb | Fristen, Zugriffe, Anbieteränderungen, Vorfälle und Sicherheit überwachen | Betreiber; Schule kontrolliert Auftrag | Verantwortliche, Termine und nachvollziehbare Nachweise |

## 10. Technischer Prüfstand und Quellen

Die Datenschutz-Units werden mit `node --test tests/unit/privacy-*.test.mjs tests/unit/student-token-revocation.test.mjs tests/unit/privacy-controls.node.mjs` ausgeführt. Am Abschluss dieses Berichts: **67 bestandene Datenschutztests**. Zusätzlich bestanden 15 betroffene Tests zu kontobezogener Begrenzung und Lehrkraftfunktionen, insgesamt **82 Tests**. Die vorhandenen drei Datenschutz-Browsertests bestanden in Chromium. Zusätzlich wurden acht lokale Darstellungen (vier Seiten bei 390 und 1280 Pixeln) sowie 18 Live-Netzwerkfälle geprüft. Der separate Netzwerkcheck ließ Service Worker zu und umging die produktive CSP nicht; die vorhandene Regression verwendet dagegen ihre bestehende Testkonfiguration mit simulierten Kontodaten.

Bei einem ersten anonymen Kolloquium-Aufruf führte die App zur öffentlichen Startseite weiter. Deren nach Einwilligung geladene Messung war kein Nachweis für Tracking im Trainer. Der Wiederholungstest hielt mit einem synthetischen lokalen Anmeldestatus die Trainerseite geöffnet und beobachtete dort keine externen Trackingverbindungen. Keine echten Anmeldedaten wurden verwendet.

Die erfolgreiche API-Gesundheitsprüfung bestätigte Prozess, Datenbank und Warteschlange; der anonyme synthetische Transkriptaufruf wurde mit 401 abgelehnt. Es wurden keine realen Konten für Abnahmezwecke gelöscht und keine personenbezogenen KI-Inhalte zu Testzwecken versandt.

Weitere amtliche Quellen für die konkrete Weiterarbeit:

- [DSGVO, amtlicher EU-Rechtstext](https://eur-lex.europa.eu/eli/reg/2016/679/oj?locale=de) – der Direktabruf war teilweise durch eine Zugriffskontrolle eingeschränkt; einzelne rechtliche Punkte wurden zusätzlich anhand amtlicher bayerischer Erläuterungen geprüft.
- [Vollzugsbekanntmachung Datenschutz an Schulen](https://www.gesetze-bayern.de/Content/Document/BayVV_204_K_13178/true).
- [BayLDA: Auftragsverarbeitung](https://www.lda.bayern.de/de/thema_auftragsverarbeitung.html).
- [BayLfD: Datenschutz-Folgenabschätzung](https://www.datenschutz-bayern.de/technik/orient/oh_dsfa.pdf).
- [§ 18 MStV](https://www.gesetze-bayern.de/Content/Document/MStV-18).

Alle verlinkten Anbieterregeln sind vor der tatsächlichen Beschaffung erneut mit dem konkreten Produkt und Kundenkonto abzugleichen. Historische September-Dokumente im Repository sind keine aktuelle Abnahmegrundlage. Maßgeblich für diese Prüfung sind dieser Bericht, der ausdrücklich als Entwurf bezeichnete Schulordner und die zugehörigen technischen Nachweise.
