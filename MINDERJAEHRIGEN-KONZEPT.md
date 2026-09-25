# Konzept für minderjährige Nutzende

Stand: 25. September 2026

## Sofortregelung

- Die allgemeinen Gymnasiums-Übungsseiten bleiben nutzbar, sofern die eingesetzten Anbieter und die Rechtsgrundlage dies erlauben.
- Der Kolloquiumstrainer bleibt wegen des derzeit eingesetzten Live-KI-Dienstes technisch auf volljährige Nutzende beschränkt.
- Lern- und Erinnerungs-E-Mails sowie Analyse und Marketing sind standardmäßig ausgeschaltet.
- Die Oberfläche fordert dazu auf, ein Kürzel zu verwenden und keine Namen oder sensiblen Angaben in Freitext, Bilder oder Dateien einzutragen.

## Empfohlenes Modell

### Direkte Privatnutzung

- Mindestalter und Rechtsgrundlage werden in AGB, Datenschutzerklärung und Registrierung konsistent genannt.
- Unterhalb der rechtlich festgelegten Altersgrenze ist eine nachweisbare Zustimmung der Sorgeberechtigten erforderlich, sofern die Verarbeitung auf Einwilligung gestützt wird.
- Keine Marketing-Einwilligung als Voraussetzung für das Konto; Einwilligungen müssen getrennt widerrufbar sein.
- Der Kolloquiumstrainer bleibt ausgeblendet bzw. gesperrt, solange der Dienst nicht ausdrücklich für Minderjährige freigegeben ist.

### Nutzung über Schulen

- Schule und myAbiFlow legen vorab Verantwortlichkeiten, Zweck, Datenarten, Löschfristen, Betroffenenrechte und Unterauftragnehmer fest.
- Schulen erhalten eine verständliche Eltern-/Schülerinformation und einen administrierten Klassenmodus.
- Es werden nur erforderliche Daten erhoben; möglichst Pseudonyme statt Klarnamen verwenden.
- Lehrkräfte sehen ausschließlich zugeordnete Lernstände. KI-Bewertungen sind Lernfeedback und keine automatische Benotung.
- Der Zugriff endet automatisch mit Kurs- bzw. Lizenzende; anschließend greift eine definierte Löschfrist.

## Technische Umsetzung

1. Das Konto erhält ein serverseitiges Merkmal für Nutzungsmodus und Altersstatus; ein bloßer Browser-Hinweis reicht für spätere Freigaben nicht aus.
2. Funktionen werden serverseitig nach Anbieter-Altersfreigabe gesperrt. Die Kolloquiums-API verlangt bereits eine 18+-Bestätigung.
3. Bei Schulzugängen wird die Freigabe durch die Schule statt durch eine Marketing-Einwilligung abgebildet.
4. Eine Datenschutzansicht zeigt Einwilligungen, Widerruf, Datenexport und Kontolöschung an einer Stelle.
5. Anbieterwechsel werden erst nach Aktualisierung von Anbieterregister, DSFA, Datenschutzerklärung und schulischer Information freigegeben.

Vor einer produktiven Minderjährigenfreigabe sollten Datenschutzbeauftragte und eine auf Schul- bzw. Jugenddatenschutz spezialisierte Rechtsberatung das Modell bestätigen.
