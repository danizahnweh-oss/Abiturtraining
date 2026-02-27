# myAbiFlow – Projekt-Regeln für Claude

## Sprache
- Antworte immer auf **Deutsch**
- Commit-Messages auf Deutsch
- Code-Kommentare auf Deutsch

## Projekt-Struktur
- **Statische Seiten** (HTML + Vanilla JS): Root-Verzeichnis → deployed via GitHub Pages auf myabiflow.de
- **Kolloquiumstrainer** (React SPA): `abitur-kolloquium-trainer/` → Vite + React 19 + TypeScript + Tailwind 4
- **Backend Worker**: `src/index.js` → Cloudflare Worker (`sag-abi-mediation-api`)
- **Gemini Proxy Worker**: `abitur-kolloquium-trainer/worker/src/index.ts` → Cloudflare Worker (`gemini-proxy`)

## Build & Deploy
- Kolloquiumstrainer bauen: `cd abitur-kolloquium-trainer && npm run build`
- Gemini Proxy deployen: `cd abitur-kolloquium-trainer && npx wrangler deploy`
- Backend deployen: `npx wrangler deploy` (aus Projekt-Root)
- Nach Änderungen an `shared.js`: Service Worker Cache-Version in `sw.js` bumpen
- **Nie** force-push auf main

## Fachliche Regeln (Bayern G9 Abitur)
- Halbjahre der Qualifikationsphase: 12/1, 12/2, 13/1, 13/2
- Streichbare Halbjahre im Kolloquium: **nur 12/1 oder 12/2**
- Kolloquium-Struktur: Teil 1 (Kurzreferat 10 min + Fragen 5 min) + Teil 2 (Gespräch 15 min)
- Lehrplan-Quelle: LehrplanPLUS Bayern G9 (lehrplanplus.bayern.de)

## Code-Konventionen
- `shared.js` darf `window.onload` NICHT überschreiben — andere Seiten brauchen eigene Handler
- API-Keys und Secrets gehören in Cloudflare Worker Secrets, nie in den Code
- ALLOWED_ORIGIN ist `https://myabiflow.de`

## Wichtige Dateien
- `shared.js` / `shared-v4.css` — gemeinsame Logik und Styles aller HTML-Seiten
- `dashboard.html` — Lehrer-Dashboard (Token-Auth)
- `abitur-kolloquium-trainer/src/lib/curriculum.ts` — verifizierte Lehrplan-Schwerpunkte
- `abitur-kolloquium-trainer/src/lib/live-api.ts` — Gemini Live API + Feedback-Prompts
