# Schulscraper – Bayerische Gymnasien

Einmaliger Daten-Sammel-Job: erstellt eine Excel-Datei mit allen ~434 bayerischen Gymnasien (Name, Adresse, Telefon, Website, Sekretariats-E-Mail) für myAbiFlow-Outreach.

## Bedienung

```bash
cd scripts/schulscraper
npm install
npx playwright install chromium

# Schritt 1: Stammdaten von km.bayern.de holen (~10–15 Min)
npm run fetch
# Optional Test: node 01-fetch-schulen.mjs --limit 10

# Schritt 2: E-Mails von Schul-Websites ergänzen (~30–60 Min)
npm run emails

# Schritt 3: Excel exportieren
npm run excel
# → output/gymnasien-bayern.xlsx

# Schlanke Outreach-Arbeitsmappe für Woche 1 erzeugen
npm run outreach
# → output/myabiflow-outreach-woche-1.xlsx
# → output/outreach-templates.md
```

Oder alles in einem Rutsch: `npm run all`

## Output

Alle Zwischendateien und das finale `gymnasien-bayern.xlsx` liegen in `output/` – das Verzeichnis ist gitignored.

### Excel-Spalten

`Schulnummer | Schulname | Träger | Straße | PLZ | Ort | Regbezirk | Telefon | Website | E-Mail | E-Mail-Status | Quelle | Stand`

### Outreach-Workflow

`npm run outreach` erzeugt eine separate Woche-1-Arbeitsmappe mit maximal 50 priorisierten Schulen aus Oberbayern/München. Die Datei ist für den risikoarmen Telefon-First-Prozess gedacht:

- pro Tag ein Batch mit 10 Schulen
- nur kurze Zustimmung zur Info-Mail einholen
- Zustimmung, Ansprechpartner und Follow-up direkt dokumentieren
- Info-Mail nur nach Zustimmung oder bestehendem persönlichem Kontakt senden

Die passenden Telefon-, Mail- und Kontaktformular-Texte stehen in `output/outreach-templates.md`.

### E-Mail-Status

- `auto-verified` – aus offiziellem KM-Verzeichnis
- `auto-extracted` – von Schul-Website extrahiert (mailto / Impressum)
- `manual-needed` – nichts gefunden, manuelle Recherche nötig
- `failed` – Schul-Website nicht erreichbar

## Datenschutz / Nutzung

- Liste enthält **nur generische Sekretariats-Adressen** (kein DSGVO-Personenbezug)
- Nicht weiterverteilen – Quelle (KM Bayern) erlaubt keine Redistribution
- Versand-Mails brauchen klaren Bildungsbezug, Opt-Out und vollständigen Impressums-Footer (§7 UWG)

## Technik

- **Playwright** für die Schulsuche (JS-gerendert, keine offene API)
- **undici + cheerio** für Schul-Websites
- **xlsx** für den Excel-Export
- **p-limit** begrenzt Parallelität auf 5 gleichzeitige Schulen
- 1 Request/Sekunde pro Domain, User-Agent `myAbiFlow-OutreachBot/1.0`
- Resume-fähig: nach jeder Seite Zwischenstand in `output/*.json`

## Wartung

Einmaliger Job – wenn die Liste veraltet, einfach neu laufen lassen. Bei Layout-Änderungen auf km.bayern.de muss `01-fetch-schulen.mjs` angepasst werden (Selektoren).
