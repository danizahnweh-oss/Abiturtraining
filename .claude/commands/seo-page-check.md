---
name: seo-page-check
description: >
  Quick SEO check for a single page. Analyzes title, meta description, headings,
  images, internal links, and Open Graph tags. Use before publishing new pages.
---

# SEO Page Check

Führe einen schnellen SEO-Check für eine einzelne Seite durch.

## Argument

$ARGUMENTS — URL oder lokaler Dateipfad der zu prüfenden Seite (z.B. `https://myabiflow.de/mathe.html` oder `mathe.html`)

## Prüfpunkte

### 1. Title Tag
- Vorhanden? Länge 50-60 Zeichen?
- Enthält Haupt-Keyword?
- Unique (nicht identisch mit anderen Seiten)?

### 2. Meta Description
- Vorhanden? Länge 140-160 Zeichen?
- Enthält Call-to-Action oder Nutzenversprechen?
- Enthält Haupt-Keyword?

### 3. Heading-Struktur
- Genau ein `<h1>`?
- Logische Hierarchie (h1 → h2 → h3, keine Sprünge)?
- Keywords in Headings?

### 4. Bilder
- Alle `<img>` haben `alt`-Attribut?
- Alt-Texte beschreibend (nicht leer oder generisch)?
- Bildformat modern (WebP/AVIF bevorzugt)?
- Explizite `width`/`height` gesetzt (CLS-Vermeidung)?

### 5. Interne Links
- Mindestens 3 interne Links auf der Seite?
- Keine broken Links?
- Aussagekräftige Linktexte (nicht "hier klicken")?

### 6. Open Graph & Social
- `og:title`, `og:description`, `og:image` vorhanden?
- `twitter:card` vorhanden?
- Canonical URL gesetzt?

### 7. Technisch
- Viewport Meta-Tag vorhanden?
- Sprache gesetzt (`lang="de"`)?
- Keine `noindex`-Tags (es sei denn gewollt)?
- Ladezeit-Killer: Inline-Styles, große Scripts im Head?

## Output

Gib eine übersichtliche Tabelle aus:

| Prüfpunkt | Status | Details |
|-----------|--------|---------|
| Title | ✅/⚠️/❌ | ... |

Danach: Top 3 Handlungsempfehlungen, sortiert nach Impact.
