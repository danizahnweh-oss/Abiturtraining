# myAbiFlow – SEO Action Plan

**Erstellt:** 18.03.2026
**Aktueller Score:** 78/100
**Ziel-Score:** 90+/100

---

## 🔴 Kritisch (sofort beheben)

### 1. 404-Fehlerseite erstellen
**Problem:** Alle unbekannten URLs geben HTTP 200 + index.html zurück
**Impact:** Crawl-Budget-Verschwendung, Duplicate Content, schlechte UX
**Lösung:** `404.html` erstellen und in Cloudflare Pages konfigurieren
**Aufwand:** ~30 Minuten

### 2. Startseite: H1-Tags reduzieren
**Problem:** ~20 H1-Tags auf index.html verwässern die Seitenrelevanz
**Impact:** Google kann Hauptthema der Seite nicht klar erkennen
**Lösung:** Nur 1 H1 ("Dein Weg zum Abitur"), alle Fach-H1s zu H2 ändern
**Aufwand:** ~15 Minuten

### 3. HSTS-Header aktivieren
**Problem:** `Strict-Transport-Security` fehlt
**Impact:** HTTPS wird nicht nach Erstbesuch erzwungen, Man-in-the-Middle möglich
**Lösung:** In Cloudflare Dashboard unter SSL/TLS → Edge Certificates → HSTS aktivieren
**Aufwand:** ~5 Minuten

---

## 🟡 Hoch (innerhalb 1 Woche)

### 4. AI-Crawler-Strategie überdenken
**Problem:** Alle AI-Crawler in robots.txt geblockt → unsichtbar in ChatGPT, Claude, Perplexity
**Impact:** Schüler die AI-Suche nutzen, finden myAbiFlow nicht
**Lösung:**
- GPTBot und ClaudeBot erlauben (für Search/Citations)
- `Content-Signal: search=yes,ai-train=no` beibehalten (verhindert Training)
- Oder: Selektiv nur bestimmte Crawler freigeben
**Aufwand:** ~10 Minuten + Entscheidung

### 5. llms.txt erstellen
**Problem:** Keine AI-optimierte Seitenbeschreibung vorhanden
**Impact:** AI-Modelle können Seite nicht effizient zusammenfassen
**Lösung:** `llms.txt` im Root mit strukturierter Beschreibung aller Angebote
**Aufwand:** ~20 Minuten

### 6. Kolloquiumstrainer URL fixen
**Problem:** `/kolloquium/` zeigt Startseite statt React-SPA
**Impact:** Sitemap-Eintrag führt ins Leere, schlechte UX
**Lösung:** Cloudflare Pages Redirect oder `_redirects`-Datei
**Aufwand:** ~15 Minuten

### 7. X-Frame-Options Header setzen
**Problem:** Seite kann in fremde iframes eingebettet werden
**Impact:** Clickjacking-Risiko, potenzielle Phishing-Angriffe
**Lösung:** In Cloudflare: `X-Frame-Options: SAMEORIGIN`
**Aufwand:** ~5 Minuten

---

## 🟠 Mittel (innerhalb 1 Monat)

### 8. Title Tags erweitern
**Problem:** Einige Titles zu kurz (22 Zeichen statt 50-60)
**Impact:** Verschenktes Keyword-Potenzial in SERPs
**Lösung:** Titles erweitern, z.B.:
- "myAbiFlow · Mathematik" → "Mathematik Klausurtraining Bayern G9 – myAbiFlow"
- "myAbiFlow · Textanalyse" → "Deutsch Textanalyse üben – Abitur Bayern – myAbiFlow"
**Aufwand:** ~1 Stunde für alle 50 Seiten

### 9. Favicon optimieren
**Problem:** `wave-icon-new.png` ist 218 KB
**Impact:** Unnötige Ladezeit, schlechter Lighthouse-Score
**Lösung:** `favicon.svg` (existiert bereits!) im HTML referenzieren
**Aufwand:** ~10 Minuten

### 10. FAQPage Schema ergänzen
**Problem:** Keine FAQ-Structured-Data trotz FAQ-Inhalten
**Impact:** Keine FAQ-Rich-Snippets in Google
**Lösung:** JSON-LD FAQPage Schema auf Startseite + relevanten Fachseiten
**Aufwand:** ~30 Minuten

### 11. Head-Scripts mit defer laden
**Problem:** `marked.min.js`, `purify.min.js`, `chart.umd.min.js` im Head ohne defer
**Impact:** Render-Blocking, langsamerer LCP
**Lösung:** `defer` Attribut hinzufügen
**Aufwand:** ~10 Minuten

### 12. theme_color vereinheitlichen
**Problem:** manifest.json (`#2563eb`) ≠ meta-Tag (`#4f46e5`)
**Impact:** Inkonsistente Darstellung in PWA/Browser
**Lösung:** Einen Wert wählen und überall verwenden
**Aufwand:** ~5 Minuten

---

## 🟢 Niedrig (Backlog)

### 13. mockup-abo.html Meta Description
**Problem:** Einzige Seite ohne Meta Description
**Lösung:** Description ergänzen
**Aufwand:** ~2 Minuten

### 14. Bilder auf WebP/AVIF umstellen
**Problem:** Alle Bilder als PNG
**Lösung:** Moderne Formate für bessere Kompression
**Aufwand:** ~1 Stunde

### 15. CSP verschärfen
**Problem:** CSP mit `*` + `unsafe-inline` ist wirkungslos
**Lösung:** Schrittweise einschränken (erst Report-Only)
**Aufwand:** ~2-3 Stunden

### 16. Sitemap lastmod-Daten ergänzen
**Problem:** Nicht alle Einträge haben lastmod
**Lösung:** `/seo-sitemap-update` Command nutzen
**Aufwand:** ~5 Minuten

### 17. Canonical-Inkonsistenz Startseite
**Problem:** Canonical zeigt auf `/` vs. `/index.html` – prüfen ob einheitlich
**Lösung:** Überall `https://myabiflow.de/` verwenden
**Aufwand:** ~5 Minuten

---

## Erwarteter Score nach Umsetzung

| Phase | Maßnahmen | Erwarteter Score |
|-------|-----------|-----------------|
| Kritisch (sofort) | #1-3 | 82/100 |
| Hoch (1 Woche) | #4-7 | 88/100 |
| Mittel (1 Monat) | #8-12 | 93/100 |
| Niedrig (Backlog) | #13-17 | 96/100 |
