# SEO Action-Plan — myabiflow.de

**Erstellt:** 15. April 2026
**Aktueller Score:** 69 / 100
**Ziel-Score:** 80+ (nach Kritisch + Hoch) → 85+ (nach allen Maßnahmen)

---

## KRITISCH — Sofort (< 1 Stunde Gesamtaufwand)

### K1: `lang="de"` auf `index.html` ergänzen
**Datei:** `index.html` Zeile 2
```html
<!-- Vorher -->
<html data-accent="blue">
<!-- Nachher -->
<html lang="de" data-accent="blue">
```

### K2: Canonical auf `landing.html` korrigieren
**Datei:** `landing.html`
```html
<!-- Vorher -->
<link rel="canonical" href="https://myabiflow.de/">
<!-- Nachher -->
<link rel="canonical" href="https://myabiflow.de/landing.html">
```

### K3: Broken Link in `llms.txt` reparieren
**Datei:** `llms.txt`
```
# Vorher
- Datenschutz: https://myabiflow.de/datenschutz.html
# Nachher
- Datenschutz & Impressum: https://myabiflow.de/impressum.html
```

### K4: Meta Description auf `abo.html` ergänzen
```html
<meta name="description" content="Abitur-Endspurt-Plan für 25€ – voller KI-Zugang zu allen Fächern für das bayerische G9-Abitur. Jetzt sichern und optimal vorbereiten.">
```

---

## HOCH — Diese Woche (1–3 Tage)

### H1: `loading="lazy"` auf alle Below-the-fold-Images
Alle `<img>` die nicht im sichtbaren Bereich beim Seitenaufruf sind:
```html
<img src="..." alt="..." loading="lazy" width="X" height="Y">
```
Betrifft ~90 Seiten. Batch-Replace in Templates.

### H2: H1-Tag im Kolloquium-Trainer ergänzen
In Haupt-React-Komponente (visuell versteckbar):
```html
<h1 class="sr-only">Kolloquium-Trainer Bayern G9 – Mündliche Abiturprüfung üben</h1>
```

### H3: `Product`+`Offer` Schema auf `abo.html` implementieren
```json
{
  "@context": "https://schema.org",
  "@type": "Product",
  "name": "myAbiFlow Premium",
  "description": "KI-gestützter Abitur-Trainer für das bayerische G9-Gymnasium und FOS/BOS",
  "brand": { "@type": "Brand", "name": "myAbiFlow" },
  "offers": {
    "@type": "Offer",
    "name": "Abitur-Plan",
    "price": "25.00",
    "priceCurrency": "EUR",
    "availability": "https://schema.org/InStock",
    "url": "https://myabiflow.de/abo.html"
  }
}
```
Ermöglicht Preis-Rich-Results in Google.

### H4: `aggregateRating` zum SoftwareApplication-Schema
Im bestehenden SoftwareApplication-Block auf `landing.html` / `index.html`:
```json
"aggregateRating": {
  "@type": "AggregateRating",
  "ratingValue": "4.8",
  "reviewCount": "47",
  "bestRating": "5"
}
```
Ohne `aggregateRating` kein App-Rich-Result bei Google.

### H5: `image` zum Article-Schema auf `kolloquium-tipps.html`
```json
"image": {
  "@type": "ImageObject",
  "url": "https://myabiflow.de/og-image.png",
  "width": 1200,
  "height": 630
}
```
Ohne Bild kein Article-Rich-Result.

### H6: 301-Redirects für intuitive URLs in Nginx
```nginx
rewrite ^/mathematik\.html$ /mathe.html permanent;
rewrite ^/kolloquium\.html$ /abitur-kolloquium-trainer/dist/ permanent;
rewrite ^/deutsch-analyse\.html$ /analyse.html permanent;
```

### H7: Title-Tags korrigieren

| Seite | Vorher | Nachher |
|-------|--------|---------|
| `abo.html` | "myAbiFlow – Abo & Preise" | "Abo & Preise – KI-Abiturtraining Bayern \| myAbiFlow" |
| `fos/index.html` | "myAbiFlow FOS – Dein Weg zum Fachabitur" | "FOS Abitur Bayern – KI-Vorbereitung für Fachabitur \| myAbiFlow" |
| Englisch-Mediation | 87 Zeichen | "Englisch Mediation Bayern üben – mit KI-Feedback \| myAbiFlow" (62 Zeichen) |

---

## MITTEL — Diesen Monat (1–4 Wochen)

### M1: `sameAs` ins Organization-Schema
```json
"sameAs": [
  "https://www.instagram.com/myabiflow",
  "https://www.tiktok.com/@myabiflow"
]
```

### M2: SEO-Landing-Page für Mathematik erstellen
Eine dedizierte `/mathe-abitur-bayern-ueben.html` im Stil der Physik/Deutsch-Seiten:
- 800+ Wörter redaktioneller Text
- FAQPage-Schema (4+ Fragen)
- BreadcrumbList + Course-Schema
- Interner Link aus `mathe.html` und `mathe-abitur.html`

**Höchstes SEO-Potenzial aller möglichen neuen Seiten.**

### M3: `fetchpriority="high"` auf Hero-Bild der Landing Page
```html
<img src="/logo-v2.png" alt="myAbiFlow" width="130" height="17" fetchpriority="high">
```

### M4: Duplicate Meta-Descriptions individualisieren
~15 Seiten mit identischem Template. Beispiel-Muster:
```
Biologie: "Biologie Abitur Bayern G9 – Genetik, Ökologie & Evolution mit KI-Feedback üben. LehrplanPLUS-konform."
Chemie: "Chemie Abitur Bayern G9 – Organik, Elektrochemie & Gleichgewichtsreaktionen mit KI-Feedback üben."
```

### M5: `changefreq` in Sitemap für fehlende 93 URLs ergänzen
```xml
<changefreq>monthly</changefreq>  <!-- Fachseiten -->
<changefreq>weekly</changefreq>   <!-- Homepage, SEO-Landingpages -->
```

### M6: CSS-Preload für kritische Stylesheets
```html
<link rel="preload" href="/shared-v4.css" as="style">
<link rel="preload" href="/fonts/fonts.css" as="style">
```

### M7: Cross-Verlinkung zwischen verwandten Fächern
- Physik → Mathematik
- Deutsch-Analyse → Kolloquium-Tipps
- Englisch → Deutsch

### M8: `twitter:site` auf allen Seiten
```html
<meta name="twitter:site" content="@myabiflow">
```

### M9: `dateModified` in Schemas ergänzen
Für alle `WebPage`- und `Article`-Schemas:
```json
"dateModified": "2026-04-15"
```

---

## NIEDRIG — Backlog

### N1: "Über uns"-Seite mit Person-Schema erstellen
Gründer-Profil mit `Person`-Schema → wichtigster langfristiger E-E-A-T-Hebel.

### N2: Datenschutz-Seite erstellen (`/datenschutz.html`)
Für DSGVO-Konformität und korrekten `llms.txt`-Link.

### N3: FAQPage-Schema auf FOS-Fachseiten (37 Seiten)
Je 3-4 fachspezifische Fragen.

### N4: Seitenspezifische OG-Bilder
1200×630px für Physik, Deutsch, Englisch, Mathe, Abo, FOS.

### N5: `hasCourseInstance` auf alle 16 Course-Items ausweiten
Aktuell nur beim Englisch-Kurs vorhanden.

### N6: LehrplanPLUS extern verlinken
```html
<a href="https://lehrplanplus.bayern.de" rel="noopener" target="_blank">LehrplanPLUS Bayern</a>
```

### N7: Nginx Security Headers prüfen und ergänzen
```bash
# Auf Hetzner ausführen:
curl -I https://myabiflow.de
```
Dann in Nginx-Config prüfen:
```nginx
add_header X-Frame-Options "DENY";
add_header X-Content-Type-Options "nosniff";
add_header Referrer-Policy "strict-origin-when-cross-origin";
add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
```

### N8: Splash-Video auf Landing mit `preload="metadata"` begrenzen

---

## Score-Prognose

| Phase | Maßnahmen | Erwarteter Score |
|-------|-----------|-----------------|
| Jetzt | — | 69 / 100 |
| Kritisch erledigt | K1–K4 | ~72 / 100 |
| + Hoch erledigt | H1–H7 | ~78 / 100 |
| + Mittel erledigt | M1–M9 | ~83 / 100 |
| + Niedrig erledigt | N1–N8 | ~87 / 100 |
