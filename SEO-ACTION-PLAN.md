# SEO Action Plan – myabiflow.de

**Erstellt:** 26.03.2026
**Status:** In Arbeit
**Ziel:** Organische Sichtbarkeit maximieren, technische SEO-Fehler beheben, AI-Crawler bedienen

---

## Sofort (diese Woche)

### 1. llms.txt erstellen
- **Impact:** Hoch | **Aufwand:** Klein
- **Betroffene Dateien:** `llms.txt` (neu), Nginx-Config
- [ ] `llms.txt` im Root erstellen mit: Produktname, Kurzbeschreibung, Zielgruppe (Bayern G9 Abitur), verfügbare Fächer, USPs (KI-Kolloquiumstrainer, Echtzeit-Feedback), Preismodell (Freemium + Schullizenzen), URL-Struktur
- [ ] In Nginx sicherstellen, dass `/llms.txt` mit `text/plain` ausgeliefert wird
- [ ] Optional: `llms-full.txt` mit erweiterter Produktdokumentation

---

### 2. noindex auf geschützte Seiten
- **Impact:** Hoch | **Aufwand:** Klein
- **Betroffene Dateien:** `dashboard.html`, `profil.html`, `aufgabe.html`, `lehrer-praesentation.html`, `lehrer-tutorial.html`, `tom.html`, `mockup-abo.html`, `dsfa.html`
- [ ] In jede dieser Dateien im `<head>` einfuegen: `<meta name="robots" content="noindex, nofollow">`
- [ ] Sicherstellen, dass keine dieser Seiten in der `sitemap.xml` enthalten ist
- [ ] Nach Deploy in Google Search Console pruefen, ob die Seiten aus dem Index fallen

---

### 3. Fehlende Seiten in Sitemap aufnehmen
- **Impact:** Hoch | **Aufwand:** Klein
- **Betroffene Dateien:** `sitemap.xml`
- [ ] Folgende Seiten hinzufuegen: `lehrer.html`, `kunst.html`, `kunst-abitur.html`, `italiano-listening.html`, `spanisch-mediation.html`, `spanisch-schreiben.html`, `spanisch-listening.html`
- [ ] `profil.html` aus der Sitemap entfernen (geschuetzte Seite)
- [ ] `lastmod`-Datum auf jeder URL aktualisieren
- [ ] `priority`-Werte sinnvoll setzen (Hauptseiten 0.8, Fachseiten 0.7, Rechtliches 0.3)

---

### 4. BreadcrumbList-Schema auf allen Seiten
- **Impact:** Mittel | **Aufwand:** Mittel
- **Betroffene Dateien:** Alle oeffentlichen HTML-Seiten (ca. 50+)
- [ ] JSON-LD `BreadcrumbList`-Template erstellen mit dynamischer Seitenstruktur
- [ ] Hierarchie definieren: Home > Fach > Aufgabentyp (z.B. Home > Spanisch > Mediation)
- [ ] Template in `shared.js` als Funktion bereitstellen oder als statisches JSON-LD pro Seite einfuegen
- [ ] Auf jeder oeffentlichen Seite im `<head>` das passende BreadcrumbList-Schema einfuegen
- [ ] Mit Google Rich Results Test validieren

---

### 5. loading="lazy" auf Bilder
- **Impact:** Mittel | **Aufwand:** Klein
- **Betroffene Dateien:** Alle HTML-Seiten mit `<img>`-Tags
- [ ] Above-the-fold-Bilder (Logo, Hero-Bild) mit `loading="eager"` versehen
- [ ] Alle anderen Bilder (Below-fold) mit `loading="lazy"` versehen
- [ ] Gleichzeitig `width` und `height` Attribute setzen, um Layout Shifts zu vermeiden
- [ ] Besonders pruefen: `index.html`, `lehrer.html`, Fachseiten mit Illustrationen

---

### 6. H1-Struktur korrigieren
- **Impact:** Mittel | **Aufwand:** Klein
- **Betroffene Dateien:** `lehrer.html`, `impressum.html`, `barrierefreiheit.html`, `dsfa.html`, `tom.html`, `mediation.html`
- [ ] `lehrer.html`: Mehrere H1 auf eine einzige reduzieren, restliche zu H2 aendern
- [ ] `impressum.html`: Mehrere H1 auf eine einzige reduzieren
- [ ] `barrierefreiheit.html`: Mehrere H1 auf eine einzige reduzieren
- [ ] `dsfa.html`: Mehrere H1 auf eine einzige reduzieren (Seite ist noindex, aber trotzdem sauber halten)
- [ ] `tom.html`: Mehrere H1 auf eine einzige reduzieren (Seite ist noindex, aber trotzdem sauber halten)
- [ ] `mediation.html`: Fehlende H1 hinzufuegen (z.B. "Mediation ueben – Abitur Bayern")
- [ ] Gesamte Heading-Hierarchie pruefen: H1 > H2 > H3, keine Spruenge

---

## Kurzfristig (diesen Monat)

### 7. Statischen SEO-Content auf Fachseiten
- **Impact:** Hoch | **Aufwand:** Gross
- **Betroffene Dateien:** Alle Fachseiten (ca. 50+), z.B. `englisch-mediation.html`, `deutsch-eroerterung.html`, `spanisch-listening.html`, etc.
- [ ] Template fuer statischen Content-Block erstellen (unterhalb der App, sichtbar fuer Crawler)
- [ ] Pro Fachseite 300-500 Woerter statischen Text schreiben mit: Was wird geueebt, Bezug zum bayerischen Lehrplan, Tipps, Aufbau der Aufgabe
- [ ] Keywords pro Seite recherchieren und einbauen (z.B. "Englisch Mediation Abitur Bayern ueben")
- [ ] `<noscript>`-Bereich oder sichtbaren Textblock unter der SPA-App platzieren
- [ ] Interne Links zu verwandten Fachseiten im Text einbauen
- [ ] Priorisierung: Zuerst Seiten mit dem hoechsten Suchvolumen (Deutsch, Englisch, Mathe)

---

### 8. Inline-JS aus index.html auslagern
- **Impact:** Mittel | **Aufwand:** Mittel
- **Betroffene Dateien:** `index.html`, neue JS-Datei(en) z.B. `homepage.js`
- [ ] Inline-JavaScript (3.500+ Zeilen) in separate Datei(en) auslagern
- [ ] Dateien mit `defer` laden
- [ ] HTML-Dateigroesse von 255 KB auf unter 50 KB reduzieren
- [ ] Testen, dass alle Funktionen (Animationen, Interaktionen, Modals) weiterhin funktionieren
- [ ] Service Worker Cache-Version in `sw.js` bumpen

---

### 9. defer auf alle Scripts
- **Impact:** Mittel | **Aufwand:** Klein
- **Betroffene Dateien:** Alle HTML-Seiten die `shared.js`, `ai-tutor.js`, `tour.js` einbinden
- [ ] `<script src="shared.js">` aendern zu `<script src="shared.js" defer>`
- [ ] `<script src="ai-tutor.js">` aendern zu `<script src="ai-tutor.js" defer>`
- [ ] `<script src="tour.js">` aendern zu `<script src="tour.js" defer>`
- [ ] Sicherstellen, dass `shared.js` kein `window.onload` ueberschreibt (CLAUDE.md Regel)
- [ ] Testen, dass die Ladereihenfolge keine Race Conditions erzeugt
- [ ] Inline-Scripts die auf diese Dateien zugreifen muessen ggf. in DOMContentLoaded wrappen

---

### 10. SearchAction fixen
- **Impact:** Mittel | **Aufwand:** Klein
- **Betroffene Dateien:** `index.html` (Schema-Block im `<head>`)
- [ ] Pruefen: Existiert eine Suchfunktion auf der Seite?
- [ ] Falls nein: `SearchAction`-Block aus dem JSON-LD Schema entfernen
- [ ] Falls ja (oder geplant): URL-Template korrekt setzen und Suche implementieren
- [ ] Empfehlung: Erstmal entfernen, spaeter bei Bedarf mit echter Suche neu einbauen

---

### 11. Interne Verlinkung ausbauen
- **Impact:** Hoch | **Aufwand:** Mittel
- **Betroffene Dateien:** `shared.js` oder neuer Footer-Partial, alle HTML-Seiten
- [ ] SEO-Footer erstellen mit strukturierten Links zu allen oeffentlichen Seiten
- [ ] Gruppierung: Nach Fach (Deutsch, Englisch, Mathe, ...) und nach Typ (Mediation, Eroerterung, Listening, ...)
- [ ] Footer auf allen Seiten einbinden (ueber shared.js oder als HTML-Include)
- [ ] Sichtbare Breadcrumb-Navigation auf jeder Seite (zusaetzlich zum Schema)
- [ ] Kontextuelle Verlinkung innerhalb des statischen Contents (siehe Punkt 7)

---

### 12. Homepage Title optimieren
- **Impact:** Mittel | **Aufwand:** Klein
- **Betroffene Dateien:** `index.html`
- [ ] Aktuellen Title pruefen
- [ ] Neuen Title setzen mit Keyword vorne, z.B.: "Abitur Vorbereitung Bayern G9 – KI-Trainer | myAbiFlow"
- [ ] Meta-Description pruefen und optimieren (max. 155 Zeichen, mit Call-to-Action)
- [ ] Open Graph Tags (`og:title`, `og:description`) entsprechend anpassen

---

### 13. Course @id-Referenz reparieren
- **Impact:** Niedrig | **Aufwand:** Klein
- **Betroffene Dateien:** Unterseiten mit Course-Schema (Fachseiten)
- [ ] Pruefen, welche Seiten ein Course-Schema mit `@id`-Referenz auf Organization haben
- [ ] Organization-Block auf diesen Unterseiten hinzufuegen oder `@id`-Referenz korrekt auf die Homepage zeigen lassen
- [ ] Mit Schema Markup Validator testen, dass alle Referenzen aufloesen

---

### 14. Article-Schema vervollstaendigen
- **Impact:** Niedrig | **Aufwand:** Klein
- **Betroffene Dateien:** `kolloquium-tipps.html`
- [ ] `publisher.logo` hinzufuegen (URL zum Logo, z.B. `https://myabiflow.de/logo-v2.png`)
- [ ] `image`-Property hinzufuegen (Beitragsbild oder passendes Standardbild)
- [ ] `datePublished` und `dateModified` pruefen und aktualisieren
- [ ] Mit Google Rich Results Test validieren

---

## Mittelfristig (Q2 2026)

### 15. Fehlende Landingpages erstellen
- **Impact:** Hoch | **Aufwand:** Gross
- **Betroffene Dateien:** `kolloquium.html` (neu), `faecher.html` (neu), `preise.html` (neu)
- [ ] `/kolloquium.html`: Landingpage fuer "Kolloquium Bayern" mit 500+ Woertern, Erklaerung des Pruefungsformats, Vorteile des KI-Trainers, CTA
- [ ] `/faecher.html`: Uebersichtsseite aller verfuegbaren Faecher mit Links zu den einzelnen Fachseiten
- [ ] `/preise.html`: Transparente Preisseite mit Freemium-Modell, Schullizenzen, FAQ
- [ ] Jede Seite mit vollstaendigem Schema-Markup, Breadcrumbs, Meta-Tags
- [ ] In Sitemap und Navigation aufnehmen
- [ ] Keyword-Recherche pro Landingpage durchfuehren

---

### 16. Font-Preload + CSS Critical Path
- **Impact:** Mittel | **Aufwand:** Mittel
- **Betroffene Dateien:** Alle HTML-Seiten, `shared-v4.css`, Nginx-Config
- [ ] Genutzte Web-Fonts identifizieren
- [ ] `<link rel="preload" as="font" type="font/woff2" crossorigin>` fuer primaere Fonts
- [ ] Critical CSS extrahieren (Above-the-fold Styles) und inline im `<head>` platzieren
- [ ] Restliches CSS asynchron laden mit `media="print" onload="this.media='all'"`
- [ ] `font-display: swap` auf allen @font-face Regeln sicherstellen

---

### 17. Brotli-Kompression in Nginx
- **Impact:** Mittel | **Aufwand:** Klein
- **Betroffene Dateien:** Nginx-Config auf Hetzner (`/etc/nginx/nginx.conf` oder Site-Config)
- [ ] Pruefen ob `ngx_brotli` Modul installiert ist
- [ ] Falls nicht: Modul installieren (`apt install libnginx-mod-brotli` oder kompilieren)
- [ ] Brotli-Konfiguration hinzufuegen: `brotli on; brotli_types text/html text/css application/javascript application/json;`
- [ ] Kompressionslevel auf 6 setzen (guter Kompromiss aus Geschwindigkeit und Groesse)
- [ ] Nginx neustarten und mit `curl -H "Accept-Encoding: br" -I` testen

---

### 18. Permissions-Policy Header
- **Impact:** Niedrig | **Aufwand:** Klein
- **Betroffene Dateien:** Nginx-Config auf Hetzner
- [ ] Header hinzufuegen: `add_header Permissions-Policy "camera=(), microphone=(self), geolocation=()" always;`
- [ ] Microphone fuer `self` erlauben (wird im Kolloquiumstrainer benoetigt)
- [ ] Kamera und Geolocation deaktivieren
- [ ] Nach Deploy mit Security Headers Checker validieren

---

### 19. HSTS preload Flag
- **Impact:** Niedrig | **Aufwand:** Klein
- **Betroffene Dateien:** Nginx-Config auf Hetzner
- [ ] Aktuellen HSTS-Header pruefen
- [ ] Aendern zu: `add_header Strict-Transport-Security "max-age=63072000; includeSubDomains; preload" always;`
- [ ] Domain bei hstspreload.org einreichen
- [ ] Vorher sicherstellen, dass ALLE Subdomains ueber HTTPS erreichbar sind

---

### 20. Logo-Bild optimieren
- **Impact:** Niedrig | **Aufwand:** Klein
- **Betroffene Dateien:** `logo-v2.png`, alle Seiten die das Logo einbinden
- [ ] Logo von 2095x431px auf ~500x103px verkleinern (wird maximal bei 101px Hoehe angezeigt)
- [ ] Als WebP exportieren (siehe Punkt 21)
- [ ] Originaldatei als Backup behalten
- [ ] `width` und `height` Attribute auf allen `<img>`-Tags fuer das Logo setzen

---

### 21. PNG-Bilder zu WebP konvertieren
- **Impact:** Niedrig | **Aufwand:** Klein
- **Betroffene Dateien:** `wave-icon-new.png`, `logo-v2.png`, ggf. weitere PNG/JPG-Bilder
- [ ] Alle Bilder identifizieren die als PNG ausgeliefert werden
- [ ] Mit `cwebp` oder aehnlichem Tool zu WebP konvertieren (Qualitaet 80-85)
- [ ] `<picture>`-Element mit WebP als primaere Quelle und PNG als Fallback nutzen
- [ ] Oder: Nur WebP ausliefern (Browser-Support ist 2026 bei 98%+)
- [ ] Dateien in Sitemap/Image-Sitemap referenzieren

---

### 22. Organization sameAs
- **Impact:** Niedrig | **Aufwand:** Klein
- **Betroffene Dateien:** `index.html` (Organization-Schema im `<head>`)
- [ ] Social-Media-Profile von myAbiFlow sammeln (Instagram, TikTok, LinkedIn, etc.)
- [ ] `sameAs`-Array im Organization-Schema hinzufuegen mit allen Profil-URLs
- [ ] Mit Schema Markup Validator testen

---

### 23. Noscript-Fallback fuer AI-Crawler
- **Impact:** Mittel | **Aufwand:** Mittel
- **Betroffene Dateien:** Alle SPA-Fachseiten (50+)
- [ ] `<noscript>`-Block auf jeder Fachseite mit statischem HTML-Inhalt
- [ ] Mindestens: Seitentitel, Kurzbeschreibung, Links zu verwandten Seiten
- [ ] Kann mit dem statischen Content aus Punkt 7 kombiniert werden
- [ ] Testen mit deaktiviertem JavaScript im Browser

---

## Tracking & Erfolgskontrolle

- [ ] Google Search Console nach jeder Aenderungswelle pruefen (Indexierung, Fehler, Impressions)
- [ ] Core Web Vitals monatlich mit PageSpeed Insights messen
- [ ] Schema-Validierung nach jeder Schema-Aenderung mit https://validator.schema.org
- [ ] Keyword-Rankings fuer Hauptbegriffe tracken: "Abitur Vorbereitung Bayern", "Kolloquium ueben", "Englisch Mediation Abitur"
- [ ] Crawl-Budget ueberwachen: Sind nur relevante Seiten im Index?
