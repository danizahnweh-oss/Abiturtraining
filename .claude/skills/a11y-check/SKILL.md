---
name: a11y-check
description: Barrierefreiheits-Test mit axe-core/pa11y gegen myabiflow.de. Nutze dies wenn der User fragt "teste Barrierefreiheit", "a11y check", "WCAG prüfen" oder "/a11y-check".
argument-hint: "[seite] – z.B. ethik oder leer für alle Kern-Seiten"
allowed-tools: Bash, Read, Write
---

Führe einen Barrierefreiheits-Test (WCAG 2.1 AA) für myAbiFlow durch.

## Argument

`$ARGUMENTS` – optionaler Seitenname (z.B. `ethik`, `biologie-abitur`). Wenn leer: alle Kern-Seiten testen.

## Schritt 1: Vorbereitung

Prüfe ob pa11y installiert ist:

```bash
export PATH="/Users/danielzahnewh/.nvm/versions/node/v22.22.1/bin:$PATH"
npx pa11y --version 2>&1
```

Wenn pa11y nicht vorhanden → installiere es temporär mit `npx` (kein globales Install nötig).

## Schritt 2: Kern-Seiten bestimmen

Wenn `$ARGUMENTS` gesetzt ist, teste nur diese Seite:
- URL: `https://myabiflow.de/$ARGUMENTS.html`

Wenn kein Argument: teste diese Kern-Seiten:
1. `https://myabiflow.de/`
2. `https://myabiflow.de/ethik.html`
3. `https://myabiflow.de/ethik-abitur.html`
4. `https://myabiflow.de/biologie-abitur.html`
5. `https://myabiflow.de/barrierefreiheit.html`
6. `https://myabiflow.de/impressum.html`
7. `https://myabiflow.de/abitur-kolloquium-trainer/`

## Schritt 3: Tests ausführen

Führe pa11y mit JSON-Output aus und speichere das Ergebnis:

```bash
export PATH="/Users/danielzahnewh/.nvm/versions/node/v22.22.1/bin:$PATH"
npx pa11y "URL" --standard WCAG2AA --reporter json 2>/dev/null
```

Für jede Seite: Ergebnis in eine JSON-Datei schreiben (z.B. `ethik-axe.json`).

**Wichtig:** Fehler beim Laden einer Seite (z.B. Timeout) separat anzeigen, nicht als Violation zählen.

## Schritt 4: Ergebnisse auswerten

Analysiere die JSON-Ergebnisse und erstelle eine Tabelle:

| Seite | Violations | Warnings | Notices | Status |
|-------|-----------|----------|---------|--------|
| ...   | ...       | ...      | ...     | ✅/⚠️/❌ |

**Status-Logik:**
- ✅ = 0 Violations
- ⚠️ = nur Warnings/Notices, keine Violations
- ❌ = mindestens 1 Violation

## Schritt 5: Violations im Detail

Für jede Violation:
- **WCAG-Kriterium** (aus dem `code`-Feld, z.B. `WCAG2AA.Principle1.Guideline1_1.1_1_1.H37`)
- **Element** (CSS-Selector aus dem `selector`-Feld)
- **Problem** (kurze Erklärung auf Deutsch)
- **Empfohlene Lösung**

## Schritt 6: Zusammenfassung

Gib am Ende aus:
- Gesamtzahl Violations über alle Seiten
- Top-3 häufigste Probleme
- Ob barrierefreiheit.html aktualisiert werden muss (Datum oder bekannte Einschränkungen)

Antworte immer auf **Deutsch**.
