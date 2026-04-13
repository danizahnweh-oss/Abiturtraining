# myAbiFlow – Aktueller Projektstatus

> Letzte Aktualisierung: April 2026
> Stand: Bayern G9 + FOS/BOS, Hetzner-Hosting, Gemini-KI

---

## 1. Zielgruppen & Varianten

| Variante | Domain | Zielgruppe |
|----------|--------|------------|
| Gymnasium G9 | myabiflow.de | Schüler 12./13. Klasse Bayern |
| FOS/BOS | myabiflow.de/fos/ | Schüler 11./12. Klasse Bayern |

---

## 2. Technologie-Stack

```
Frontend (Static HTML + Vanilla JS)
├── shared.js (~45 KB) – gemeinsame Logik aller HTML-Seiten
├── shared-v4.css – Tailwind-Output, globale Styles
├── sw.js (v113) – Service Worker / PWA
└── manifest.json – PWA-Manifest (standalone, theme: #4f46e5)

React SPA (abitur-kolloquium-trainer/)
├── React 19 + TypeScript + Vite
├── Tailwind CSS 4 + Framer Motion + KaTeX + Lucide
├── lib/live-api.ts – Gemini Live API (Audio-Streaming)
└── lib/curriculum.ts – Lehrplan-Daten ISB Bayern (20 Fächer)

Backend API (src/index.js)
├── Node.js / Cloudflare-Worker-Style auf Hetzner
├── PostgreSQL
├── 13 Handler-Module + 15 Fach-Handler + FOS-Router
└── SSE-Streaming für Deutsch-Korrekturen

Hosting (Hetzner 162.55.62.231)
├── Nginx – Static Files + Reverse Proxy
├── PM2: myabiflow-api, myabiflow-gemini, myabiflow-tutor
└── Deploy: bash build-pages.sh → scp → pm2 restart
```

---

## 3. HTML-Seiten (Gymnasium G9)

### Hauptseiten
| Datei | Funktion |
|-------|----------|
| `index.html` | Landingpage + Schüler-Dashboard |
| `aufgabe.html` | Aufgaben-Code-Einstieg für Schüler |
| `abitur-vorbereitung.html` | Fächer-Übersicht |
| `abo.html` | Preismodell / Subscription |
| `dashboard.html` | Lehrer-Dashboard (Token-Auth) |
| `lehrer.html` | Lehrer-Landingpage |
| `lehrer-tutorial.html` | Onboarding für Lehrkräfte |
| `profil.html` | Schüler-Profil |
| `kolloquium-praesentation.html` | Kolloquium-Infos |
| `kolloquium-tipps.html` | Kolloquium-Tipps |
| `404.html` | Fehlerseite |
| `impressum.html` / `agb.html` / `dsfa.html` | Rechtliches |
| `barrierefreiheit.html` | Accessibility Statement |

### Fachseiten (je: Üben + Abitur-Modus)
| Fach | Üben | Abitur |
|------|------|--------|
| Deutsch | – | `analyse.html`, `eroerterung.html`, `interpretation.html`, `materialgestuetzt-argumentierend.html`, `materialgestuetzt-informierend.html` |
| Englisch | – | `mediation.html`, `writing.html`, `listening.html` |
| Französisch | – | `francais-mediation.html`, `francais-schreiben.html` |
| Italienisch | – | `italiano-mediation.html`, `italiano-schreiben.html`, `italiano-listening.html` |
| Spanisch | – | `spanisch-mediation.html`, `spanisch-schreiben.html`, `spanisch-listening.html` |
| Latein | – | `latein-abitur.html` |
| Mathematik | `mathe.html` | `mathe-abitur.html` |
| Chemie | `chemie.html` | `chemie-abitur.html` |
| Physik | `physik.html` | `physik-abitur.html` |
| Biologie | `biologie.html` | `biologie-abitur.html` |
| Informatik | `informatik.html` | `informatik-abitur.html` |
| Geschichte | `geschichte.html` | `geschichte-abitur.html` |
| Politik & Gesellschaft | `politik.html` | `pug-abitur.html` |
| Wirtschaft & Recht | `wr.html` | `wr-abitur.html` |
| Geographie | `geographie.html` | `geographie-abitur.html` |
| Ethik | `ethik.html` | `ethik-abitur.html` |
| Evangelische Religion | `religion.html` | `religion-abitur.html` |
| Katholische Religion | `katholisch.html` | `katholisch-abitur.html` |
| Kunst | `kunst.html` | `kunst-abitur.html` |
| Sport | `sport.html` | `sport-abitur.html` |

---

## 4. FOS/BOS-Variante (`fos/`, 37 Seiten)

Orange Theme (#ea580c). Separate Login-Seite, eigene CSS.

**Fächer nach Zweig:**

| Zweig | Fächer |
|-------|--------|
| Allgemein | Deutsch, Englisch, Geschichte, Ethik |
| Technologie | Mathematik, Physik, Chemie, Technologie, WInf |
| Wirtschaft/Sozial | BWR, VWL, Rechtslehre, IBS, Pädagogik/Psychologie, Soziologie |
| Gestaltung/Freizeit | Gestaltung, Kunstgeschichte, Gesundheit |
| Sonstige | Französisch, Gruppendiskussion (mündlich) |

---

## 5. Kolloquium-Trainer (React SPA)

**Pfad:** `abitur-kolloquium-trainer/`
**URL:** myabiflow.de/kolloquium/

### Features
- Live Sprachprüfung mit Google Gemini (bidirektionales Audio-Streaming)
- 5 Prüfer-Charaktere: standard, streng, freundlich, zeitdruck, detailfragen
- Phasen-Timer: Referat (10 min) → Fragen (5 min) → Gespräch (15 min)
- Echtzeit-Transkription (Schüler & KI)
- Material-Generierung: Impulse, Zitate, Statistiken, Schaubilder
- Feedback mit LaTeX-Rendering (KaTeX) + PDF-Export
- Mathe-Spezial: Aufgaben-Vortrag statt Halbjahre
- 20 Fächer mit verifizierten ISB-Schwerpunkten (LehrplanPLUS)
- Dark Mode + Tutorial-Overlay

### Lehrplan-Struktur (curriculum.ts)
- Halbjahre: 12/1, 12/2, 13/1, 13/2
- Streichbar: nur 12/1 oder 12/2
- Mathe: Gebiete statt Halbjahre

---

## 6. Backend API – Alle Endpunkte

### Auth & Nutzer
| Endpunkt | Funktion |
|----------|----------|
| `POST /api/login` | Schüler-Login (Email/Passwort) |
| `POST /api/check-student` | Account prüfen |
| `POST /api/teacher-login` | Teacher-Dashboard-Zugang |
| `POST /api/teacher-register` | Lehrer registrieren |
| `POST /api/teacher-auth-login` | Lehrer-Auth |
| `POST /api/teacher-codes` | Klassen-Codes generieren |
| `POST /api/link-student-code` | Schüler mit Lehrer verknüpfen |
| `POST /api/teacher-profile` | Lehrer-Profil abrufen/ändern |

### Korrektur & Bewertung
| Endpunkt | Funktion |
|----------|----------|
| `POST /api/grade` | Allgemeine Korrektur |
| `POST /api/grade-deutsch` | Deutsch-Korrektur |
| `POST /api/grade-deutsch-stream` | Deutsch-Korrektur (SSE-Streaming) |
| `POST /api/grade-[fach]-abitur` | Fachspezifische eA-Korrektur |
| `POST /api/fos-grade-*` | FOS-Korrektur |
| `GET /api/grade-status` | Job-Status (async grading) |

### Aufgaben-Generierung
| Endpunkt | Funktion |
|----------|----------|
| `POST /api/generate` | Aufgabe generieren (Englisch) |
| `POST /api/generate-deutsch` | Deutschaufgabe |
| `POST /api/generate-[fach]` | Fachspezifisch |
| `POST /api/parse-task` | Aufgaben-Struktur analysieren |
| `POST /api/model-answer` | Musterlösung generieren |
| `POST /api/generate-from-materials` | Upload → Aufgabe generieren |

### Teacher-Tasks (geteilte Aufgaben)
| Endpunkt | Funktion |
|----------|----------|
| `POST /api/teacher-tasks` | Meine Aufgaben |
| `POST /api/teacher-task-results` | Ergebnisse pro Aufgabe |
| `POST /api/get-shared-task` | Aufgabe per Code laden |
| `POST /api/submit-shared-task` | Schüler-Einreichung |

### Dashboard & Ergebnisse
| Endpunkt | Funktion |
|----------|----------|
| `POST /api/results` | Alle Schüler-Ergebnisse |
| `POST /api/students` | Klassenliste |
| `POST /api/delete-student` | Schüler entfernen |
| `POST /api/submit-result` | Ergebnis speichern |
| `POST /api/feedback-list` | Feedback-Übersicht |
| `POST /api/feedback-valuable` | Feedback als hilfreich markieren |

### Nachrichten
| Endpunkt | Funktion |
|----------|----------|
| `POST /api/messages/send` | Nachricht senden |
| `POST /api/messages/list` | Nachrichten abrufen |
| `POST /api/messages/inbox` | Posteingang |
| `POST /api/messages/reply` | Antworten |
| `POST /api/messages/mark-read` | Als gelesen markieren |
| `POST /api/messages/delete` | Löschen |

### Analytics & Lernplan
| Endpunkt | Funktion |
|----------|----------|
| `POST /api/student-results` | Persönliche Ergebnis-Historie |
| `POST /api/competency-profile` | Stärken/Schwächen-Analyse |
| `POST /api/learning-plan` | Lernempfehlungen |

### Stripe / Payments
| Endpunkt | Funktion |
|----------|----------|
| `POST /api/stripe/create-checkout` | Zahlung starten |
| `POST /api/stripe/webhook` | Stripe-Webhooks (signiert) |
| `GET /api/stripe/subscription-status` | Abo-Status (5 min Cache) |
| `POST /api/stripe/customer-portal` | Billing-Verwaltung |
| `POST /api/stripe/start-trial` | Gratis-Testphase |
| `POST /api/stripe/redeem-license` | Lizenzschlüssel einlösen |

### Teacher-Credits
| Endpunkt | Funktion |
|----------|----------|
| `POST /api/teacher/credit-balance` | Guthaben abrufen |
| `POST /api/teacher/credit-history` | Verlauf |

---

## 7. shared.js – Globale Funktionen

### Auth & Abo
- `getAccessToken()` – Session-Token
- `checkSubscription()` – Status (5 min Cache)
- `requireSubscription()` – Redirect wenn kein Abo
- `showTrialBannerIfNeeded()` – Trial-Countdown-Banner
- Teacher-Credits als Abo-Alternative

### API
- `apiCall(endpoint, body)` – Haupt-API-Funktion (inkl. Auto-OCR, Retry, Shared-Task-Linking)
- `apiCallStream(endpoint, body)` – SSE für Deutsch-Streaming
- Rate-Limiting: 5 Req/min (normal), 3 Login/min

### UI
- `showToast(msg, type)` – Toast-Notifications
- `trapFocus(container)` – Accessibility (Tab-Trap)
- `escapeHtml(str)` – XSS-Schutz
- `countWords(text)` / `updateWordCount()` – Wort-Counter
- `toggleDarkMode()` / `initTheme()` – Dark Mode
- `nav(step, pushHistory)` – Step-Navigation

### Session & Verlauf
- `getStudentKey()` – Schüler-ID
- `saveSession()` / `restoreSession()` – LocalStorage
- `startTimer()` / `pauseTimer()` / `stopTimer()` – Timer
- `getHistory()` / `saveToHistory()` / `deleteHistoryEntry()` / `clearHistory()` – Verlauf

### Feedback-Rendering
- `renderKorrekturFeedback(data)` – Feedback mit Fehlern, Punkten, Erklärungen
- `renderUebungsaufgaben(data)` – Übungsaufgaben-Vorschläge
- `renderProgressWith(history)` – Chart + Statistiken

### Rewrite-Feature
- `renderRewriteButton(feedbackData)` – Button nach Feedback
- `showRewriteOverlay(result)` – Modal zum Neuschreiben
- `getRewriteType()` / `getRewriteTopic()` – Params

### PDF/Export
- `exportPDF()` / `exportTaskPDF(mode)` – Download
- `printElement(el)` – Print-Dialog
- `injectPdfButton()` – Auto-Inject
- `showPdfExportModal()` – Export-Optionen

### Teacher-Mode
- URL-Params: `?mode=teacher&teacher_token=xyz`
- `_showTeacherAdoptBanner()` – iFrame-Banner
- `_teacherAdoptTask()` – postMessage an Parent

---

## 8. Lehrer-Dashboard (dashboard.html)

### Bereiche
| Tab | Funktion |
|-----|----------|
| Übersicht | Stats-Grid: Schüler, Einreichungen, Durchschnitt, offene Aufgaben |
| Schüler | Tabelle sortierbar, Detail-Modal (Stats, Heatmap, Verlauf) |
| Ergebnisse | Filterable Tabelle (Fach, Datum, Status, Score) |
| Feedback | Schüler-Feedback (Bug, Wunsch, Lob), "Hilfreich"-Toggle |
| Aufgaben | Geteilte Aufgaben verwalten, Codes generieren |
| Admin | Lehrer-Liste, Approve/Reject (nur Admins) |

### Schüler-Detail-Modal
- Persönliche Stats (Einreichungen, Durchschnitt, Verbesserung)
- Fach-Heatmap (Noten pro Fach)
- Verlauf-Chart

---

## 9. Externe Integrationen

| Service | Zweck |
|---------|-------|
| Google Gemini (gemini-2.5-flash) | KI-Korrektur, Aufgaben-Gen, Live-Audio-Kolloquium |
| Stripe | Abo-Payments, Trial, Lizenzschlüssel |
| Google Analytics (GA4) | Event-Tracking + UTM |
| Meta Pixel | Conversion-Tracking (nach Consent) |
| Unsplash | Bilder für Aufgaben |
| Telegram Bot | Admin-Alerts (API-Fehler, Feedback) |
| Hetzner | Hosting (Static + API + PostgreSQL) |

---

## 10. Besondere Features

### OCR
- Handgeschriebene/gescannte Antworten werden automatisch erkannt
- `handleOCR()` → Text-Extraktion → direkt an Grading übergeben

### Adaptive Bildqualität (bei Upload)
- Bei 6+ Seiten: zuerst Bilder lesen, dann bewerten (Batch-Extraktion)
- Verhindert Inkonsistenz bei vielen Seiten

### Streaming-Feedback (Deutsch)
- SSE-Endpoint gibt Feedback progressiv aus
- Schüler sieht Korrektur während KI noch schreibt

### Teacher-Credits
- Alternative zum Schüler-Abo
- Lehrer kauft Korrekturen → verteilt an Klasse
- Tracking: Guthaben, Historie, Abzug pro Korrektur

### Shared Tasks
- Lehrer generiert Aufgaben-Code (8 Zeichen)
- Schüler ruft Aufgabe per Code ab
- iFrame-Mode: Lehrer-Preview mit "Aufgabe übernehmen"-Banner
- Ergebnisse werden dem Lehrer zugeordnet

### Lehrplan-konforme Kolloquium-Simulation
- 20 Fächer mit verifizierten ISB-Schwerpunkten
- Operatoren nach Anforderungsbereichen (AB I/II/III)
- Mathe: Aufgaben-Vortrag (Schüler rechnet vor, KI stellt Fragen)
- Streichbare Halbjahre: nur 12/1 oder 12/2

### PWA / Offline
- Service Worker v113 (Cache-first für Assets, Network-first für HTML)
- Installierbar als App (standalone)
- Offline-Fallback für API: `{ error: 'Offline' }` (503)

### Tablet-Optimierung (immer aktiv)
- Touch-Targets ≥ 44×44px
- Input font-size ≥ 16px (kein Auto-Zoom)
- Landscape + Portrait getestet
- `env(safe-area-inset-*)` für fixed Elemente

---

## 11. Abiturprüfung G9 – Struktur (implementiert)

- **5 Prüfungsfächer:** 3 schriftlich + 2 mündlich (Kolloquium)
- **3 eA-Fächer:** Deutsch + Mathematik (automatisch eA) + 1 Leistungsfach (wählbar)
- **2 gA-Fächer:** Fach 4 + Fach 5
- eA: mind. 2× schriftlich, max. 1× mündlich
- gA: mind. 1× mündlich, max. 1× schriftlich
- NEU G9: Nur eines von Deutsch/Mathe muss verpflichtend schriftlich sein

---

## 12. Wichtige Datei-Referenzen

| Datei | Zweck |
|-------|-------|
| `shared.js` | Gemeinsame Logik aller HTML-Seiten |
| `shared-v4.css` | Globale Styles (Tailwind) |
| `sw.js` | Service Worker (Cache-Version bumpen nach shared.js-Änderung) |
| `src/index.js` | Backend-Router |
| `dashboard.html` | Lehrer-Dashboard |
| `abitur-kolloquium-trainer/src/lib/curriculum.ts` | Lehrplan-Schwerpunkte |
| `abitur-kolloquium-trainer/src/lib/live-api.ts` | Gemini Live API + Feedback-Prompts |
| `build-pages.sh` | Build + Deploy (statische Seiten + React) |
| `CLAUDE.md` | Projekt-Regeln für KI-Assistenten |
