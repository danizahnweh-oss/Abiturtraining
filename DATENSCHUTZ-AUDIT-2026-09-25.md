# Datenschutz-Audit myAbiFlow

**Stand:** 25. September 2026  
**Umfang:** öffentlich erreichbare Website, Einwilligungsbanner, Registrierung, Server- und KI-Datenflüsse, Löschung, lokale Browserdaten sowie die veröffentlichten Dokumente `impressum.html`, `dsfa.html` und `tom.html`  
**Hinweis:** Dies ist eine technische und organisatorische Datenschutzprüfung, keine anwaltliche Rechtsberatung.

## Kurzurteil

myAbiFlow hat bereits einige gute Schutzmaßnahmen. Insbesondere werden Analyse- und Werbedienste erst nach einer Zustimmung geladen, Passwörter werden nicht im Klartext gespeichert, die Website läuft verschlüsselt und ein großer Teil der Infrastruktur liegt bei Hetzner in Deutschland.

Der derzeitige Stand sollte trotzdem **nicht als vollständig datenschutzkonform bezeichnet werden**. Es gibt zwei besonders dringende Punkte:

1. Die Nutzungsbedingungen der Google Gemini API schließen API-Clients aus, die sich an Minderjährige richten oder wahrscheinlich von Minderjährigen genutzt werden. myAbiFlow richtet sich ausdrücklich auch an Schülerinnen und Schüler unter 18 Jahren. Das ist kein Problem, das allein durch eine bessere Datenschutzerklärung gelöst werden kann.
2. Automatische Aktivierungs-, Erinnerungs- und Rückgewinnungs-E-Mails werden ohne getrennte, nachweisbare Werbeeinwilligung versendet. Die vorhandene E-Mail-Verifizierung ist keine Werbeeinwilligung.

Außerdem beschreibt die veröffentlichte Datenschutzerklärung mehrere tatsächliche Datenverarbeitungen nicht oder nicht richtig. Besonders betroffen sind Stripe, Ideogram, Hugging Face, Telegram, Feedbackdaten, lokale Entwürfe und Transkripte sowie die vollständige Kontolöschung.

## Priorisierte Befunde

| Priorität | Befund | Risiko | Empfohlene Maßnahme |
|---|---|---|---|
| Kritisch | Gemini-API und Minderjährige | Vertrags- und Datenschutzrisiko bei einem Kernangebot | Gemini-Funktionen für Minderjährige sofort aussetzen oder zu einer vertraglich geeigneten Google-Enterprise-/Vertex-Lösung wechseln; vorher schriftlich prüfen lassen |
| Kritisch | Automatische Werbe- und Rückgewinnungs-E-Mails ohne getrennte Einwilligung | Unzulässige Direktwerbung, besonders problematisch bei Minderjährigen | Nur notwendige Konto-E-Mails senden; für Lern-/Marketing-E-Mails freiwilliges, nicht vorausgewähltes Opt-in mit Nachweis und dauerhaft funktionierender Abmeldung einführen |
| Hoch | Datenschutzerklärung bildet die tatsächlichen Empfänger nicht vollständig ab | Informationspflichten werden voraussichtlich nicht erfüllt | Stripe, Ideogram, Hugging Face, Telegram und sämtliche Resend-Verwendungen ergänzen; Zwecke, Daten, Rechtsgrundlage, Land, Garantien und Speicherfrist einzeln nennen |
| Hoch | Löschversprechen ist technisch nicht vollständig belegt | Nutzer erwarten eine vollständige Löschung, während Restdaten bleiben können | Löschung über alle Tabellen und externen Dienste als getesteten Gesamtprozess umsetzen |
| Hoch | Lokale Entwürfe, Antworten und Kolloquiums-Transkripte können langfristig im Browser verbleiben | Daten bleiben auf gemeinsam genutzten Geräten sichtbar | Klare Fristen, automatische Bereinigung und vollständiges Löschen bei Abmeldung/Kontolöschung einbauen und offenlegen |
| Hoch | Minderjährigen-Konzept und Rechtsgrundlagen sind zu pauschal | Die Beschreibung „Schulkontext“ trifft nicht auf alle Direktkunden zu | Alters-/Rollenmodell, Verantwortlichkeiten von Schulen und Rechtsgrundlage je Verarbeitung verbindlich festlegen |
| Hoch | DSFA unterschätzt besondere Kategorien und Drittanbieter | Risikobewertung ist unvollständig | DSFA vollständig aktualisieren; Religion, Ethik und Politik sowie Sprach-/Textinhalte als mögliches Offenbarungsrisiko bewerten |
| Mittel | Widerruf der Tracking-Einwilligung ist nicht so einfach wie die Erteilung | Nutzer müssen Browserdaten löschen statt eine sichtbare Einstellung zu verwenden | Dauerhaften Link „Datenschutz-Einstellungen“ anbieten; Analyse und Werbung getrennt steuerbar machen |
| Mittel | Sicherheitsangaben stimmen nicht vollständig mit der Live-Seite überein | TOM nennt HSTS, die statischen Seiten liefern den Header derzeit nicht aus | Sicherheitsheader in allen Nginx-Antworten setzen und anschließend automatisiert testen |
| Mittel | Protokolle enthalten Namen und teilweise E-Mail-Adressen | Unnötige personenbezogene Daten in Logs | Pseudonyme IDs verwenden, E-Mail-Adressen entfernen und kurze dokumentierte Log-Fristen festlegen |

## Detaillierte Feststellungen

### 1. Google Gemini ist für das aktuelle Zielpublikum kritisch

myAbiFlow verwendet Gemini unter anderem für Live-Audio/Tutoring und Bildgenerierung. Die derzeit veröffentlichten [Gemini-API-Nutzungsbedingungen](https://ai.google.dev/gemini-api/terms) verlangen, dass Nutzer der API mindestens 18 Jahre alt sind, und untersagen API-Clients, die sich an unter 18-Jährige richten oder wahrscheinlich von ihnen genutzt werden. Die Zielgruppe von myAbiFlow umfasst ausdrücklich 16- bis 18-Jährige und teilweise jüngere Schülerinnen und Schüler.

Zusätzlich beschreibt Google für Missbrauchskontrollen eine Aufbewahrung von Eingaben, Kontext und Ausgaben von bis zu 55 Tagen; markierte Inhalte können geprüft werden. Die aktuelle Datenschutzerklärung bildet diese Details nicht ausreichend ab. Quelle: [Google Gemini API – Abuse monitoring](https://ai.google.dev/gemini-api/docs/usage-policies).

**Empfehlung:** Gemini-basierte Funktionen nicht nur textlich nachbessern, sondern bis zur Klärung für Minderjährige deaktivieren. Danach entweder eine nachweislich geeignete Enterprise-/Vertex-Vertragskonstellation einsetzen oder einen anderen Anbieter bzw. selbst betriebene Modelle verwenden.

### 2. E-Mail-Kommunikation benötigt eine klare Trennung

Die Registrierung verlangt tatsächlich eine E-Mail-Adresse. In der Datenschutzerklärung und der DSFA wird sie dagegen als optional beschrieben. Der Dienst versendet neben notwendigen Nachrichten zur Verifizierung und Passwortwiederherstellung auch Willkommens-, Aktivierungs-, Inaktivitäts-, Wochen- und Prüfungserinnerungen, sofern nicht nachträglich widersprochen wurde.

Für Werbung per E-Mail verlangt § 7 UWG grundsätzlich eine vorherige ausdrückliche Einwilligung; die Ausnahme für Bestandskunden ist eng und passt nicht zuverlässig zu jeder kostenlosen Registrierung. Quelle: [§ 7 UWG](https://www.gesetze-im-internet.de/uwg_2004/__7.html).

**Empfehlung:**

- Transaktionale E-Mails auf Verifizierung, Sicherheit, Passwort und unmittelbar bestellte Leistungen begrenzen.
- Lern- und Marketing-E-Mails nur nach getrenntem, freiwilligem Opt-in versenden.
- Einwilligung mit Zeitpunkt, Textversion, Quelle und Zweck protokollieren.
- Abmeldung ohne Anmeldung und ohne kurz ablaufenden Abmeldelink dauerhaft ermöglichen.
- Datenschutzerklärung und Registrierungstext an die tatsächliche Pflicht-E-Mail anpassen.

### 3. Empfänger und Datenflüsse sind unvollständig dokumentiert

In der veröffentlichten Empfängerliste fehlen mehrere tatsächlich verwendete Dienste:

- **Stripe:** erhält bei Zahlung unter anderem Name, interne Schüler-ID und Marketingparameter. Stripe muss als Zahlungsdienstleister beschrieben werden. Marketingparameter sollten nur übermittelt werden, wenn sie wirklich benötigt werden.
- **Ideogram:** wird als Ausweichdienst zur Bilderzeugung verwendet. Vor weiterer Nutzung müssen Vertrag zur Auftragsverarbeitung, Übermittlungsgrundlage, Minderjährigen-Eignung und verlangte Anbieterkennzeichnung geklärt werden. Quelle: [Ideogram API Terms](https://about.ideogram.ai/legal/api-tos).
- **Hugging Face:** erhält Tutorfragen zur Erzeugung von Embeddings. Diese Fragen können personenbezogene oder sensible Inhalte enthalten.
- **Telegram:** erhält bei Lehrkraft-Anmeldungen Namen, E-Mail-Adresse und einen Freigabelink. Telegram wird außerdem für Fehlerhinweise genutzt. Personenbezogene Daten und Freigabe-Token sollten nicht über Telegram übertragen werden.
- **Resend:** wird nicht nur für freiwillige Erinnerungen, sondern auch für Verifizierung, Passwortzurücksetzung, Feedback und weitere Nachrichten verwendet. Die Beschreibung ist entsprechend zu erweitern. Quelle: [Resend DPA](https://resend.com/legal/dpa).
- **Feedback:** Bewertung, Kategorie, Nachricht, Seite, Schülername und gegebenenfalls ein Foto werden verarbeitet. Dieser eigene Zweck fehlt in der Erklärung.

Nach Art. 13, 28 und 44 ff. DSGVO müssen Zwecke, Empfänger und internationale Übermittlungen transparent und vertraglich abgesichert sein. Quelle: [Datenschutz-Grundverordnung](https://eur-lex.europa.eu/legal-content/DE/TXT/?uri=CELEX%3A32016R0679).

### 4. Die vollständige Kontolöschung ist derzeit nicht nachgewiesen

Die Datenschutzerklärung verspricht, dass bei einer Kontolöschung alle Daten entfernt werden. Die aktuelle Löschroutine entfernt jedoch primär den Eintrag in der Schülertabelle. Einige Tabellen sind über automatische Datenbankregeln angebunden, andere Datensätze verwenden lediglich den Namen oder eine interne Kennung und werden nicht nachweislich mitgelöscht. Dazu kommen externe Daten, insbesondere ein möglicher Stripe-Kundendatensatz.

Betroffen sein können unter anderem Lernpläne, Analyseereignisse, Nachrichten, Token, Einreichungen, Feedback, Nutzungs- und Abrechnungsdaten sowie lokal gespeicherte Browserdaten.

**Empfehlung:** Einen zentralen Löschdienst erstellen, der in einer kontrollierten Transaktion alle internen Datensätze entfernt oder gesetzlich erforderliche Finanzdaten sperrt/anonymisiert, anschließend externe Löschungen anstößt und das Ergebnis protokolliert. Automatisierte Tests müssen für jede Datentabelle belegen, dass keine verwaisten Nutzerdaten bleiben.

### 5. Lokaler Browserspeicher wird zu knapp beschrieben

Die Erklärung nennt hauptsächlich Theme, Profil, Sitzung und Einwilligung. Tatsächlich können auch Namen, generierte Prüfungen, Aufgabenstände, Antworten, Entwürfe, Prüfungsdaten, Lehrerinformationen sowie Kolloquiums-Transkripte und aktive Sitzungen im Browser gespeichert werden. Teile davon werden bei einer normalen Abmeldung nicht vollständig entfernt und haben keine klar erkennbare maximale Lebensdauer.

Das ist auf privaten Geräten praktisch, auf Schul- oder Familiengeräten aber riskant. Die Grundsätze der Datenminimierung und Speicherbegrenzung ergeben sich aus Art. 5 DSGVO.

**Empfehlung:**

- Speicherdauer je Schlüssel festlegen und technisch erzwingen.
- Personenbezogene Lerninhalte bei Abmeldung und Kontolöschung entfernen.
- Wiederherstellungsdaten verschlüsseln oder nur kurzzeitig im Sitzungsspeicher ablegen.
- Vor dem Speichern erklären, welche Daten lokal verbleiben.
- Eine sichtbare Funktion „Lokale Lerndaten löschen“ anbieten.

### 6. Einwilligungsbanner: gute technische Sperre, aber schwacher Widerruf

Positiv ist, dass Google Analytics und Google Ads beim Test weder vor einer Entscheidung noch nach „Ablehnen“ geladen wurden. Nach „Akzeptieren“ wurden die erwarteten Google-Dienste und Cookies aktiv. Die technische Vorab-Sperre funktioniert somit.

Verbesserungsbedarf besteht trotzdem:

- „Mehr erfahren“ verweist auf die DSFA statt auf die Datenschutzerklärung.
- Analyse und Werbung werden gemeinsam freigegeben, statt getrennt wählbar zu sein.
- Es gibt keinen dauerhaft sichtbaren Einstellungslink. Der Nutzer soll Browserdaten löschen oder erneut ablehnen; das ist nicht so einfach wie die Zustimmung.

Art. 7 Abs. 3 DSGVO verlangt, dass der Widerruf so einfach wie die Einwilligung ist. Die Datenschutzkonferenz empfiehlt zudem eine gleichwertig erreichbare Ablehnmöglichkeit. Quellen: [DSGVO](https://eur-lex.europa.eu/legal-content/DE/TXT/?uri=CELEX%3A32016R0679), [DSK Orientierungshilfe Telemedien](https://www.datenschutzkonferenz-online.de/media/oh/20221130_OH_Telemedien_2021_Version_1_1.pdf), [§ 25 TDDDG](https://www.gesetze-im-internet.de/ttdsg/__25.html).

### 7. Minderjährige und sensible Inhalte sind nicht ausreichend berücksichtigt

Die Erklärung nimmt pauschal einen schulischen Kontext und ein berechtigtes Interesse an. Das passt nicht zu allen direkten Registrierungen und Bezahlvorgängen. Eine Altersprüfung oder ein belastbarer Nachweis der Schule beziehungsweise Sorgeberechtigten ist nicht erkennbar.

Die DSFA sagt außerdem, es würden keine besonderen Kategorien personenbezogener Daten verarbeitet. Freitexte und Audioantworten in Politik, Religion oder Ethik können jedoch politische Ansichten, religiöse Überzeugungen oder andere sehr persönliche Informationen offenbaren. Auch wenn das nicht beabsichtigt ist, muss dieses vorhersehbare Risiko bewertet und durch klare Eingabehinweise, Filter, kurze Fristen und eingeschränkte Anbieterübermittlung reduziert werden.

Bei einer direkt angebotenen digitalen Dienstleistung ist Art. 8 DSGVO besonders zu prüfen, falls eine Verarbeitung auf Einwilligung gestützt wird. Quelle: [DSGVO](https://eur-lex.europa.eu/legal-content/DE/TXT/?uri=CELEX%3A32016R0679).

### 8. Sicherheitsdokumentation und Live-Konfiguration stimmen nicht überein

Die TOM nennt HSTS als aktiv. Die statischen Live-Seiten lieferten beim Test jedoch keinen HSTS-Header und auch nicht durchgängig weitere wichtige Browser-Sicherheitsheader aus. Die API-Antworten enthielten diese Header. Ursache ist voraussichtlich die Header-Vererbung in den einzelnen Nginx-Bereichen.

Zusätzlich erlauben mehrere Content-Security-Policies weiterhin `unsafe-inline` und `unsafe-eval`. Das ist kein unmittelbarer Datenschutzverstoß, erhöht aber das Risiko, dass eingeschleuster Code auf Browserdaten zugreift.

**Empfehlung:** Sicherheitsheader in jeder Antwort mit `always` setzen, CSP schrittweise härten, Serverkennung reduzieren und die Live-Header automatisiert überwachen.

### 9. DSFA und TOM müssen aktualisiert werden

Die DSFA ist für September 2026 zur Überprüfung vorgesehen und enthält mittlerweile mehrere überholte oder nicht belegte Aussagen:

- E-Mail sei optional.
- Alle Nutzerdaten verblieben in Deutschland.
- Es würden keine besonderen Kategorien verarbeitet.
- Sämtliche Nutzerdaten würden vollständig gelöscht.
- Die betrachteten Dienstleister und Übermittlungen seien vollständig.
- Das Restrisiko sei insgesamt niedrig genug.

Eine erneute Datenschutz-Folgenabschätzung muss alle aktuellen Funktionen, Anbieter, Minderjährigenrisiken, Audio- und Freitextdaten sowie echte Lösch- und Speicherfristen einbeziehen. Art. 35 DSGVO verlangt eine aktuelle Risikobewertung bei voraussichtlich hohem Risiko.

## Was bereits gut umgesetzt ist

- Analyse und Werbung werden technisch erst nach Zustimmung geladen.
- „Ablehnen“ verhindert die getesteten Tracking-Anfragen und Cookies.
- Die Hauptinfrastruktur wird in Deutschland bei Hetzner betrieben.
- Passwörter werden gehasht und nicht im Klartext gespeichert.
- E-Mail-Verifizierung, Schutz vor einfacher Kontoauskunft und Anfragelimits sind vorhanden.
- Audio-Transkripte im kurzfristigen Sitzungsspeicher haben eine zeitliche Begrenzung.
- Die OpenAI API verwendet Kundendaten standardmäßig nicht zum Training. Missbrauchsprotokolle können bei der Standardkonfiguration bis zu 30 Tage aufbewahrt werden; die Erklärung sollte Ausnahmen für rechtliche oder Sicherheitsanforderungen korrekt formulieren. Quelle: [OpenAI API data controls](https://platform.openai.com/docs/models/default-usage-policies-by-endpoint).

## Konkreter Maßnahmenplan

### Innerhalb von 24 Stunden

1. Alle nicht zwingend notwendigen E-Mail-Kampagnen deaktivieren.
2. Gemini-Funktionen für Minderjährige pausieren beziehungsweise bis zur Vertragsklärung abschalten.
3. Übertragung personenbezogener Daten an Telegram beenden.
4. Hugging-Face-Embedding und Ideogram-Fallback aussetzen, bis Vertrag, Datenschutz und Zielgruppen-Eignung geklärt sind.
5. Auf Registrierung und Footer einen gut sichtbaren Hinweis ergänzen, dass die Datenschutzerklärung gerade aktualisiert wird; keine unzutreffenden Zusicherungen wiederholen.

### Innerhalb von drei Arbeitstagen

1. Eine eigenständige, verständliche Datenschutzerklärung veröffentlichen.
2. Für jeden Zweck eine Tabelle mit Datenarten, Rechtsgrundlage, Empfänger, Land, Transfergarantie und Frist erstellen.
3. Registrierung mit Pflicht-E-Mail korrekt beschreiben und optionale Kommunikation getrennt wählbar machen.
4. Tracking-Einstellungen dauerhaft erreichbar und nach Zweck getrennt steuerbar machen.
5. Auf allen statischen Seiten die vorgesehenen Sicherheitsheader ausliefern.

### Innerhalb von ein bis zwei Wochen

1. Vollständige Kontolöschung und Datenexport umsetzen und automatisiert testen.
2. Fristen für jede Datenbanktabelle, jeden Logtyp, lokalen Browserspeicher und jeden externen Anbieter festlegen und technisch erzwingen.
3. Namen und E-Mail-Adressen aus Logs entfernen oder pseudonymisieren.
4. DSFA, TOM, Verzeichnis der Verarbeitungstätigkeiten, Auftragsverarbeitungsverträge und Transferbewertungen aktualisieren.
5. Ein belastbares Minderjährigen- und Schulkonzept mit Zuständigkeiten, Altersgrenzen und Eingabehinweisen festlegen.
6. Einen regelmäßigen Datenschutz-Regressionstest in den Release-Prozess aufnehmen.

## Prüfumfang und Grenzen

Geprüft wurden Quellcode, veröffentlichte Rechtstexte und die von außen beobachtbare Live-Seite. Nicht eingesehen wurden unterzeichnete Auftragsverarbeitungsverträge, Google-/Stripe-/Resend-Kontoeinstellungen, Abrechnungsstatus, interne Löschprotokolle oder tatsächliche Produktionsdaten. Aussagen zu diesen Punkten sind daher als zu verifizierende Risiken gekennzeichnet. Eine abschließende rechtliche Bewertung sollte durch eine auf Datenschutz und Minderjährige spezialisierte Stelle erfolgen.
