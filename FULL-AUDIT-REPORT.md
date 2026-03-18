# myAbiFlow – Vollständiger SEO-Audit

**Datum:** 18.03.2026
**Domain:** https://myabiflow.de
**Geschäftstyp:** EdTech / Bildungsplattform (Bayerisches Abitur G9 + FOS)
**Seiten analysiert:** 50 HTML-Dateien (Root) + 35 FOS-Unterseiten + React SPA

---

## Executive Summary

### SEO Health Score: 78/100

| Kategorie | Gewicht | Score | Gewichtet |
|-----------|---------|-------|-----------|
| Technical SEO | 22% | 68/100 | 15.0 |
| Content Quality | 23% | 88/100 | 20.2 |
| On-Page SEO | 20% | 85/100 | 17.0 |
| Schema / Structured Data | 10% | 95/100 | 9.5 |
| Performance (CWV) | 10% | 70/100 | 7.0 |
| AI Search Readiness | 10% | 35/100 | 3.5 |
| Bilder | 5% | 75/100 | 3.8 |
| **Gesamt** | **100%** | | **76/100** |

### Top 5 Kritische Probleme
1. **Keine 404-Seite** – Alle unbekannten URLs geben HTTP 200 + index.html zurück → Soft 404s, Crawl-Budget-Verschwendung
2. **~20 H1-Tags auf der Startseite** – Verwässert die Seitenrelevanz für Google
3. **KI-Crawler komplett geblockt** – ClaudeBot, GPTBot, Perplexity etc. in robots.txt gesperrt → keine AI-Search-Sichtbarkeit
4. **HSTS-Header fehlt** – HTTPS wird nicht erzwungen nach Erstbesuch
5. **Kolloquiumstrainer-URL falsch** – `/kolloquium/` liefert Startseite statt React-SPA

### Top 5 Quick Wins
1. `404.html` erstellen → sofort besseres Crawling
2. H1-Tags auf Startseite zu H2 ändern (nur 1x H1 behalten)
3. `llms.txt` erstellen für AI-Search-Sichtbarkeit
4. Favicon von 218 KB PNG auf SVG umstellen
5. `mockup-abo.html` Meta Description ergänzen

---

## 1. Technical SEO (68/100)

### Crawlability
| Prüfpunkt | Status | Details |
|-----------|--------|---------|
| robots.txt | ✅ | Vorhanden, Sitemap referenziert, Standard-Crawler erlaubt |
| Sitemap.xml | ✅ | 85 URLs, korrekte Priorities, XML valide |
| HTTPS | ✅ | HTTP → HTTPS Redirect (301) funktioniert |
| Canonical URLs | ✅ | 100% aller Seiten haben korrekte Canonicals |
| 404-Handling | ❌ | **Keine 404.html** – Soft 404s überall |
| Redirect-Chains | ✅ | Max 1 Hop (HTTP → HTTPS) |

### Indexability
| Prüfpunkt | Status | Details |
|-----------|--------|---------|
| Meta Robots | ✅ | `noindex` nur bei dsfa.html + tom.html (korrekt) |
| Duplicate Content | ⚠️ | Soft 404s liefern index.html → potenzielle Duplikate |
| hreflang | ℹ️ | Nicht nötig (nur deutschsprachig) |

### Security Headers
| Header | Status | Bewertung |
|--------|--------|-----------|
| HTTPS/SSL | ✅ | Aktiv via Cloudflare |
| X-Content-Type-Options | ✅ | `nosniff` |
| Referrer-Policy | ✅ | `strict-origin-when-cross-origin` |
| Strict-Transport-Security | ❌ | **Fehlt komplett** |
| X-Frame-Options | ❌ | **Fehlt** – Clickjacking möglich |
| Content-Security-Policy | ⚠️ | Vorhanden, aber `*` + `unsafe-inline` + `unsafe-eval` = wirkungslos |
| Permissions-Policy | ❌ | Fehlt |
| Access-Control-Allow-Origin | ⚠️ | `*` – sehr permissiv |

### Sitemap-Analyse
- **85 URLs** gelistet, logisch nach Fachbereichen gruppiert
- **Fehlend in Sitemap:** `lehrer.html`, `dashboard.html`, `mockup-abo.html`
- **In Sitemap aber vermutlich irrelevant:** Keine Probleme gefunden
- **lastmod-Daten:** Nicht bei allen Einträgen vorhanden
- **Canonical-URL der Startseite:** `index.html` vs. `/` → Inkonsistenz prüfen

---

## 2. Content Quality (88/100)

### E-E-A-T Assessment
| Signal | Status | Details |
|--------|--------|---------|
| Expertise | ✅ | Lehrplankonforme Inhalte, G9-Bayern-Bezug |
| Experience | ✅ | Interaktive Übungsaufgaben mit KI-Feedback |
| Authority | ✅ | JSON-LD Organization mit echtem Impressum, UG-Rechtsform |
| Trust | ✅ | Impressum, AGB, Datenschutz, Barrierefreiheitserklärung, DSFA, TOM vorhanden |

### Content-Abdeckung
- **50 HTML-Seiten** im Root (Gymnasium)
- **35+ FOS-Unterseiten**
- **16 Fächer** mit jeweils Klausur- + Abiturtraining
- **React SPA** für Kolloquiumstrainer
- **Kein Thin Content** erkannt – alle Seiten haben funktionale Inhalte

### Readability
- Klare, schülerfreundliche Sprache
- Gut strukturierte Aufgaben mit Handlungsanweisungen
- Fachbegriffe werden im Kontext verwendet

---

## 3. On-Page SEO (85/100)

### Title Tags
| Metrik | Wert |
|--------|------|
| Abdeckung | 100% (50/50) |
| Format | `myAbiFlow · [Fach]` – konsistent |
| Länge | 22–65 Zeichen (optimal: 50–60) |
| Problem | Einige Titles zu kurz (z.B. "myAbiFlow · Mathematik" = 22 Zeichen) |

**Empfehlung:** Kurze Titles erweitern, z.B. "Mathematik Klausurtraining Bayern – myAbiFlow"

### Meta Descriptions
| Metrik | Wert |
|--------|------|
| Abdeckung | 98% (49/50) |
| Fehlend | `mockup-abo.html` |
| Länge | 99–160 Zeichen (optimal: 140–160) |
| Qualität | ✅ Keyword-reich, actionsorientiert |

### Heading-Struktur
| Seite | H1-Anzahl | Status |
|-------|-----------|--------|
| index.html | ~20 | ❌ **Viel zu viele** – nur 1 H1 empfohlen |
| Alle anderen | 1 | ✅ Korrekt |

### Interne Verlinkung
- **Startseite:** 69 interne Links (Hub-Seite) ✅
- **Unterseiten:** Ø 10 Links (Navigation + Footer) ✅
- **Verwaiste Seiten:** `mockup-abo.html` möglicherweise nicht verlinkt
- **Struktur:** Flache Hierarchie (max. 2 Klicks zur Startseite) ✅

---

## 4. Schema / Structured Data (95/100)

### Implementierung
| Schema-Typ | Seiten | Status |
|------------|--------|--------|
| Organization/EducationalOrganization | index.html | ✅ Vollständig mit Adresse, Gründer |
| WebSite + SearchAction | index.html | ✅ |
| WebPage | index.html | ✅ |
| ItemList (16 Courses) | index.html | ✅ |
| Course | Alle Fachseiten | ✅ Mit educationalLevel, audience, offers |
| BreadcrumbList | Alle Unterseiten | ✅ |

### Validation
- **Format:** JSON-LD (Best Practice) ✅
- **@context:** schema.org korrekt referenziert ✅
- **Offers:** Preis 0 EUR korrekt für Freemium ✅

### Fehlende Opportunities
- **FAQPage** Schema für häufige Fragen → Featured Snippets
- **VideoObject** für Splash-Video auf Startseite
- **Review/Rating** Schema wenn Nutzerbewertungen vorhanden

---

## 5. Performance (70/100)

### Geschätzte Core Web Vitals
| Metrik | Einschätzung | Details |
|--------|-------------|---------|
| LCP | ⚠️ Mittel | Splash-Video + 6641 Zeilen HTML auf Startseite |
| INP | ✅ Gut | Vanilla JS, kein schweres Framework auf Hauptseiten |
| CLS | ✅ Gut | Bilder haben `width`/`height` Attribute |

### Resource-Optimierung
| Ressource | Status | Details |
|-----------|--------|---------|
| Script Loading | ✅ | `defer` bei KaTeX, keine render-blocking Scripts |
| Service Worker | ✅ | Cache v83, Network-first für HTML |
| Cache-Control | ✅ | `must-revalidate` für HTML |
| Favicon | ❌ | **218 KB PNG** – sollte < 10 KB sein |
| CSS | ✅ | 1 CSS-Datei (shared-v4.css, 3589 Zeilen) |

### Drittanbieter-Scripts
- KaTeX (Math-Rendering) – defer ✅
- Chart.js – im Head, kein defer ⚠️
- Marked.js + DOMPurify – im Head, kein defer ⚠️

---

## 6. Bilder (75/100)

| Prüfpunkt | Status | Details |
|-----------|--------|---------|
| Alt-Texte | ✅ | 100% Abdeckung (116/116 Bilder) |
| Formate | ⚠️ | PNG für Logo/Icons – WebP/AVIF wäre besser |
| Favicon | ❌ | 218 KB `wave-icon-new.png` – `favicon.svg` existiert aber wird nicht genutzt |
| og-image.png | ✅ | Vorhanden, korrekt referenziert |
| width/height | ✅ | Auf den meisten Bildern gesetzt |

---

## 7. AI Search Readiness (35/100)

| Prüfpunkt | Status | Details |
|-----------|--------|---------|
| llms.txt | ❌ | **Nicht vorhanden** |
| AI-Crawler Zugang | ❌ | **Komplett geblockt** (ClaudeBot, GPTBot, CCBot, Bytespider, Google-Extended, Applebot-Extended, meta-externalagent) |
| Citability | ⚠️ | Gute Struktur, aber Crawler können nicht zugreifen |
| Brand Mentions | ✅ | Konsistentes Branding "myAbiFlow" |
| Structured Data | ✅ | Gut für AI-Parsing geeignet |

**Großes Problem:** Die robots.txt blockt ALLE KI-Crawler. Das bedeutet:
- myAbiFlow erscheint **nicht** in ChatGPT, Claude, Perplexity etc.
- Schüler die "Abitur Trainer Bayern" in AI-Suche eingeben, finden myAbiFlow **nicht**
- `Content-Signal: search=yes,ai-train=no` ist ein Cloudflare-Feature – aber die `Disallow`-Regeln überschreiben das

---

## 8. Weitere Befunde

### PWA / Manifest
- manifest.json vorhanden ✅
- **theme_color Inkonsistenz:** manifest.json = `#2563eb`, meta-Tag = `#4f46e5`

### Kolloquiumstrainer (React SPA)
- URL `/kolloquium/` liefert Startseite statt SPA ❌
- Korrekte URL: `/abitur-kolloquium-trainer/dist/`
- SPA hat minimales HTML ohne Meta-Tags → SEO-blind ⚠️

### Barrierefreiheit (SEO-relevant)
- ARIA-Labels vorhanden ✅
- `role="status"`, `aria-live="polite"` implementiert ✅
- Focus Traps für Modals ✅
- `.sr-only` CSS-Klasse für Screen Reader ✅

---

## Scoring-Begründung

| Kategorie | Stärken | Schwächen | Score |
|-----------|---------|-----------|-------|
| Technical (22%) | robots.txt, sitemap, HTTPS, canonicals | Kein 404, fehlende Security Headers | 68 |
| Content (23%) | E-E-A-T stark, kein Thin Content, 50+ Seiten | - | 88 |
| On-Page (20%) | Titles 100%, Metas 98%, JSON-LD, gute Links | H1-Problem Startseite, kurze Titles | 85 |
| Schema (10%) | Course, Organization, Breadcrumbs, WebSite | FAQPage fehlt | 95 |
| Performance (10%) | defer Scripts, SW-Caching, kein CLS | Großes Favicon, Head-Scripts ohne defer | 70 |
| AI Readiness (10%) | Gute Struktur, Branding | Alle AI-Crawler geblockt, kein llms.txt | 35 |
| Bilder (5%) | 100% Alt-Texte | PNG statt WebP, großes Favicon | 75 |
