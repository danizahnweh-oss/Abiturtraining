# SEO Full Audit — myabiflow.de

**Datum:** 15. April 2026
**Analysierte Seiten:** 101 (Sitemap) + Stichproben
**Business-Typ:** EdTech B2C/B2B, Bayern Abitur Niche SEO, Freemium SaaS

---

## SEO Health Score: 69 / 100

| Kategorie | Gewichtung | Score | Gewichtet |
|-----------|-----------|-------|-----------|
| Technical SEO | 22% | 78 | 17,2 |
| Content-Qualität | 23% | 62 | 14,3 |
| On-Page SEO | 20% | 68 | 13,6 |
| Schema / Structured Data | 10% | 75 | 7,5 |
| Performance (CWV) | 10% | 60 | 6,0 |
| AI Search Readiness | 10% | 80 | 8,0 |
| Bilder | 5% | 55 | 2,75 |
| **Gesamt** | **100%** | | **69 / 100** |

---

## Executive Summary

### Top 5 Kritische Issues

1. `lang="de"` fehlt auf `index.html` (Homepage ohne Sprachdeklaration)
2. Canonical auf `landing.html` zeigt auf `https://myabiflow.de/` → Duplicate-Content-Risiko
3. Kein H1-Tag im Kolloquium-Trainer (`/abitur-kolloquium-trainer/dist/`)
4. `datenschutz.html` in `llms.txt` verlinkt, aber Seite existiert nicht (404)
5. Thin Content auf ~15 Standard-Trainer-Seiten (kaum indexierbarer redaktioneller Text)

### Top 5 Quick Wins

1. `lang="de"` in `index.html` ergänzen (5 Minuten)
2. Canonical auf `landing.html` korrigieren (5 Minuten)
3. `datenschutz.html`-Link in `llms.txt` reparieren (5 Minuten)
4. `loading="lazy"` auf alle Below-the-fold-Images ergänzen (30 Minuten)
5. Meta Description auf `abo.html` ergänzen (5 Minuten)

---

## 1. Technical SEO

### 1.1 robots.txt — Note: A

- Korrekte Sitemap-Referenz
- `/api/` korrekt blockiert
- Vorbildliche KI-Crawler-Strategie: GPTBot, ClaudeBot, PerplexityBot **erlaubt** — CCBot, Bytespider, Amazonbot **blockiert**
- Einziges Minusproblem: Redundante `User-agent: Googlebot`-Regel (durch `*` bereits abgedeckt)

### 1.2 Sitemap — Note: B+

| Metrik | Wert |
|--------|------|
| Gesamt-URLs | 101 |
| Mit `lastmod` | 101 (100%) |
| Mit `changefreq` | 8 (8%) |
| Mit `priority` | 101 (100%) |
| Nachgewiesene 404-Fehler | 0 (alle Sitemap-URLs erreichbar) |

**Issues:**
- `/abitur-kolloquium-trainer/dist/` in Sitemap — unschöner Build-Pfad als öffentliche URL
- `changefreq` fehlt bei 93 von 101 URLs
- `lastmod` des Kolloquiumstrainers nicht bei jedem Deploy aktualisiert

### 1.3 Canonical-Tags — Note: A (mit Ausnahme)

- Alle 108 HTML-Dateien haben Canonical-Tags — vorbildlich
- **Kritische Ausnahme:** `landing.html` canonical zeigt auf `https://myabiflow.de/` statt auf sich selbst → Google behandelt Landing-Page als Duplikat der Homepage

### 1.4 Indexierbarkeit — Note: B

- Kein ungewolltes `noindex` gefunden
- JS-Redirect auf `index.html` → Googlebot rendert JS, sieht `landing.html` als Inhalt der Homepage (akzeptabel solange Landing-Page SEO-stark ist)
- `lang="de"` **fehlt auf `index.html`** — alle anderen 100+ Seiten haben es

### 1.5 Security Headers — Note: C

- CSP vorhanden via `<meta>`-Tag (schwächer als HTTP-Header — kein `frame-ancestors`-Support)
- `unsafe-inline` + `unsafe-eval` schwächen CSP
- `X-Frame-Options`, `HSTS`, `X-Content-Type-Options`, `Referrer-Policy` via Nginx nicht verifiziert
- **Empfehlung:** `curl -I https://myabiflow.de` auf Hetzner ausführen

### 1.6 Fehlende 301-Redirects für intuitive URLs

| Eingetippte URL | Status | Sollte zu |
|----------------|--------|-----------|
| `/mathematik.html` | 404 | `/mathe.html` |
| `/kolloquium.html` | 404 | `/abitur-kolloquium-trainer/dist/` |
| `/deutsch-analyse.html` | 404 | `/analyse.html` |

---

## 2. Content-Qualität

### 2.1 E-E-A-T — Note: D+ (kritischste Schwäche)

| Signal | Status |
|--------|--------|
| Gründer namentlich im Schema | ✅ |
| Autor-Bio-Seite | ❌ Fehlt |
| "Über uns"-Seite | ❌ Fehlt |
| Person-Schema für Gründer | ❌ Fehlt |
| Testimonials öffentlich sichtbar | ❌ Fehlt |
| Pilotschul-Referenzen auf der Site | ❌ Fehlt |
| LehrplanPLUS verlinkt | ❌ Nur erwähnt, nicht verlinkt |

### 2.2 Content-Tiefe nach Seitentyp

| Seitentyp | Anzahl | Content-Qualität |
|-----------|--------|-----------------|
| SEO-Landingpages (Physik, Deutsch, Englisch) | 3 | ✅ Gut — langer Text, FAQs |
| Kolloquium-Tipps / Abitur-Vorbereitung | 2 | ✅ Gut |
| Standard-Trainer-Seiten (Biologie, Chemie etc.) | ~15 | ❌ Thin Content |
| FOS-Fachseiten | 37 | ⚠️ Mittel — funktional, kein FAQ-Schema |

### 2.3 Größte Content-Gap

**Keine SEO-Landing-Page für Mathematik** — Mathe ist das meistgesuchte Abiturfach in Bayern. `mathe-abitur.html` existiert, ist aber keine dedizierte SEO-Landingpage. Höchstes SEO-Potenzial aller möglichen neuen Seiten.

### 2.4 Duplicate Content

- `mathe.html` + `mathe-abitur.html` — durch unterschiedliche Canonicals korrekt behandelt
- Duplicate Meta-Descriptions auf ~15 Standard-Trainer-Seiten: identisches Template ohne fachspezifische Keywords

---

## 3. On-Page SEO

### 3.1 Title Tags

| Seite | Titel | Länge | Status |
|-------|-------|-------|--------|
| Homepage | "myAbiFlow – Abitur Vorbereitung Bayern 2026 \| KI-Trainer für G9" | 68 | ✅ Gut |
| Kolloquium-Tipps | "Kolloquium Bayern G9 – So bereitest du dich optimal vor" | 56 | ✅ Sehr gut |
| Mathe-Abitur | "Mathematik Abiturtraining Bayern G9 – KI-Feedback · myAbiFlow" | 63 | ✅ Gut |
| Englisch-Mediation | "Englisch Mediation Bayern üben – Aufgaben, Beispiele & Feedback \| myAbiFlow" | 87 | ❌ Zu lang |
| Abo | "myAbiFlow – Abo & Preise" | 25 | ❌ Viel zu kurz |
| FOS | "myAbiFlow FOS – Dein Weg zum Fachabitur" | 41 | ❌ Kein Keyword |

### 3.2 Meta Descriptions

| Seite | Status |
|-------|--------|
| Abo | ❌ Fehlt komplett |
| Mathe-Abitur | ❌ Fehlt (im Live-Fetch) |
| ~15 Trainer-Seiten | ⚠️ Duplicate — identisches Template |
| SEO-Landingpages | ✅ Individuell, keyword-reich |

### 3.3 Heading-Struktur

- Saubere H1→H2→H3-Hierarchie auf SEO-Landingpages
- **Fehler:** Kein H1 im Kolloquium-Trainer
- **Risiko:** FOS-Startseite H1 durch JS-Login-Overlay verdeckt

### 3.4 Interne Verlinkung

- Gute Funnel-Verlinkung: SEO-Landingpages → Trainer
- **Gap:** Keine Cross-Verlinkung zwischen verwandten Fächern

---

## 4. Schema / Structured Data

### 4.1 Implementierungsübersicht

| Schema-Typ | Status |
|-----------|--------|
| Organization + EducationalOrganization | ✅ Sehr vollständig |
| WebSite + SearchAction (Sitelinks) | ✅ |
| FAQPage | ✅ Sehr gut (Homepage 11 Fragen, SEO-Landingpages 4 je) |
| BreadcrumbList | ✅ Konsistent auf allen Unterseiten |
| Course + CourseInstance | ✅ Gut (16 Kurse) |
| SoftwareApplication | ⚠️ Unvollständig |
| HowTo + Article | ✅ (kolloquium-tipps.html) |
| Product + Offer (Abo-Seite) | ❌ Fehlt komplett |
| aggregateRating | ❌ Fehlt komplett |
| Person (Gründer) | ❌ Fehlt |

### 4.2 Kritische Schema-Fehler

1. **SoftwareApplication zeigt nur `"price": "0"`** — bezahlte Abos fehlen (irreführend)
2. **Kein `aggregateRating`** → App erscheint nicht als Rich Result in Google
3. **Kein `image` im Article-Schema** → kein Article-Rich-Result möglich
4. **Kein `sameAs` im Organization-Schema** → Entität nicht extern verifizierbar
5. **`hasCourseInstance` nur bei 1 von 16 Kursen**

---

## 5. Performance (Core Web Vitals — geschätzt aus HTML)

| Metrik | Einschätzung | Hauptursache |
|--------|-------------|-------------|
| LCP | ⚠️ Mittel | Kein `fetchpriority="high"` auf Hero-Bild; Splash-Video above the fold |
| CLS | ⚠️ Mittel-schlecht | Bilder ohne `width`/`height`; JS-Login-Overlay |
| INP | ✅ Gut | Keine schweren Third-Party-Scripts |
| FCP | ⚠️ Mittel | `shared-v4.css` + `fonts.css` render-blocking ohne `preload` |

**Positives:**
- `font-display: swap` durchgängig → kein FOIT
- Fonts lokal gehostet (kein DNS-Lookup auf Google Fonts)
- Service Worker v117 → aggressives Caching für Wiederbesucher

---

## 6. Bilder

| Prüfpunkt | Status |
|-----------|--------|
| `loading="lazy"` | ❌ Nur auf 4 von 101 Seiten |
| `fetchpriority="high"` | ❌ Nicht vorhanden |
| WebP vorhanden | ✅ og-image.webp vorhanden |
| og:image als WebP genutzt | ❌ PNG referenziert (WebP vorhanden aber ignoriert) |
| Seitenspezifische OG-Bilder | ❌ Alle Seiten nutzen dieselbe og-image.png |

---

## 7. AI Search Readiness

| Signal | Status |
|--------|--------|
| `llms.txt` vorhanden | ✅ Excellent — vorbildliche Struktur |
| llms.txt broken Link (datenschutz.html) | ❌ Seite existiert nicht |
| robots.txt KI-Differenzierung | ✅ Vorbildlich |
| FAQPage-Schema (AI-extrahierbar) | ✅ Sehr gut |
| `sameAs` (Entitäts-Verifikation) | ❌ Fehlt |
| Person-Schema (E-E-A-T) | ❌ Fehlt |
| `dateModified` in Schemas | ❌ Fast überall fehlend |
| Externe Quellenlinks (LehrplanPLUS) | ❌ Erwähnt aber nicht verlinkt |
| **Citability Score** | **6 / 10** |

---

## 8. Open Graph & Social

| Tag | Status |
|-----|--------|
| og:title, og:description | ✅ Alle Seiten |
| og:image | ⚠️ Einheitliches Bild auf allen Seiten |
| og:locale (de_DE) | ✅ |
| twitter:card (summary_large_image) | ✅ |
| twitter:site | ❌ Fehlt auf allen Seiten |
| Seitenspezifische OG-Bilder | ❌ Fehlen |

---

## Gesamtbewertung nach Bereichen

| Bereich | Note |
|---------|------|
| robots.txt | A |
| Sitemap | B+ |
| Canonicals | A (Ausnahme: landing.html) |
| Indexierbarkeit | B |
| Structured Data | B |
| Open Graph | B |
| Security Headers | C |
| Content-Tiefe / E-E-A-T | D+ |
| Performance | C+ |
| AI Search Readiness | B+ |
