# myAbiFlow – Projekt-Regeln für Claude

## Sprache
- Antworte immer auf **Deutsch**
- Commit-Messages auf Deutsch
- Code-Kommentare auf Deutsch

## Projekt-Struktur
- **Statische Seiten** (HTML + Vanilla JS): Root-Verzeichnis → deployed via **Cloudflare Pages** auf myabiflow.de
- **Kolloquiumstrainer** (React SPA): `abitur-kolloquium-trainer/` → Vite + React 19 + TypeScript + Tailwind 4
- **Backend Worker**: `src/index.js` → Cloudflare Worker (`sag-abi-mediation-api`)
- **Gemini Proxy Worker**: `abitur-kolloquium-trainer/worker/src/index.ts` → Cloudflare Worker (`gemini-proxy`)

## Build & Deploy
- **Statische Seiten + Kolloquiumstrainer:** `bash build-pages.sh` → `npx wrangler pages deploy _site --project-name=myabiflow`
- Gemini Proxy deployen: `cd abitur-kolloquium-trainer && npx wrangler deploy`
- Backend deployen: `npx wrangler deploy` (aus Projekt-Root)
- Nach Änderungen an `shared.js`: Service Worker Cache-Version in `sw.js` bumpen
- **Nie** force-push auf main

## Automatischer Workflow
- Nach **jeder** Code-Änderung automatisch: committen → pushen → deployen
- Reihenfolge bei statischen Seiten / Kolloquiumstrainer: `bash build-pages.sh` → `npx wrangler pages deploy _site --project-name=myabiflow` → git commit & push
- Reihenfolge bei Backend-Änderungen: Wrangler deploy → git commit & push
- Nicht einzeln nachfragen — einfach machen

## Fachliche Regeln (Bayern G9 Abitur)
- Halbjahre der Qualifikationsphase: 12/1, 12/2, 13/1, 13/2
- Streichbare Halbjahre im Kolloquium: **nur 12/1 oder 12/2**
- Kolloquium-Struktur: Teil 1 (Kurzreferat 10 min + Fragen 5 min) + Teil 2 (Gespräch 15 min)
- Lehrplan-Quelle: LehrplanPLUS Bayern G9 (lehrplanplus.bayern.de)

### Abiturprüfung G9 – Struktur (Quelle: KM Bayern, Stand 25.02.2026)
- **5 Prüfungsfächer** insgesamt: 3 schriftlich + 2 mündlich (Kolloquium)
- **3 eA-Fächer:** Deutsch + Mathematik (beide automatisch eA) + 1 frei wählbares **Leistungsfach** (eA)
- **2 gA-Fächer:** Fach 4 + Fach 5
- eA-Verteilung: mindestens 2× schriftlich, höchstens 1× mündlich
  → d.h. entweder Deutsch **oder** Mathe darf mündlich sein (nicht beide)
- gA-Verteilung: mindestens 1× mündlich, höchstens 1× schriftlich
- NEU G9: Nur eines von Deutsch/Mathe muss verpflichtend schriftlich sein
- Leistungsfach kann schriftlich oder mündlich sein (solange eA-Regel erfüllt)

## Tablet-Optimierung (immer beachten!)
Bei **jeder** Änderung an HTML, CSS oder JS automatisch sicherstellen, dass die Seite auf allen Tablets (iPad, Android, Surface etc.) optimal funktioniert:
- **Touch-Targets:** Alle klickbaren Elemente mindestens 44×44px
- **Kein Hover-Only:** Funktionalität darf nie nur über `:hover` erreichbar sein — immer auch Touch/Tap-Alternative
- **Kein Auto-Zoom:** Input-Felder mindestens `font-size: 16px`, damit Tablets nicht reinzoomen
- **Responsive Breakpoints:** Tablet-Bereich (768px–1024px) explizit berücksichtigen, nicht nur Desktop vs. Handy
- **Safe Areas:** `env(safe-area-inset-*)` bei fixed/sticky Elementen beachten
- **Flexbox/Grid statt fixed:** Layouts bevorzugt mit Flexbox/Grid, `position: fixed` nur wo nötig
- **Modals/Overlays:** Müssen auf Tablet-Viewports vollständig sichtbar und scrollbar sein
- **Touch-Events:** `click`-Events reichen (kein `mouseenter`/`mouseleave` für wichtige Funktionen)
- **Overflow-Scrolling:** `-webkit-overflow-scrolling: touch` für scrollbare Container
- **Viewport:** `<meta name="viewport" content="width=device-width, initial-scale=1">` auf jeder Seite
- **Landscape + Portrait:** Layouts müssen in beiden Orientierungen funktionieren

## Code-Konventionen
- `shared.js` darf `window.onload` NICHT überschreiben — andere Seiten brauchen eigene Handler
- API-Keys und Secrets gehören in Cloudflare Worker Secrets, nie in den Code
- ALLOWED_ORIGIN ist `https://myabiflow.de`

## Wichtige Dateien
- `shared.js` / `shared-v4.css` — gemeinsame Logik und Styles aller HTML-Seiten
- `dashboard.html` — Lehrer-Dashboard (Token-Auth)
- `abitur-kolloquium-trainer/src/lib/curriculum.ts` — verifizierte Lehrplan-Schwerpunkte
- `abitur-kolloquium-trainer/src/lib/live-api.ts` — Gemini Live API + Feedback-Prompts
