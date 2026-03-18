---
name: seo-diff
description: >
  Check SEO-relevant changes since last commit. Detects accidentally removed or
  changed titles, meta descriptions, canonicals, structured data, and robots directives.
  Use after code changes to catch SEO regressions.
---

# SEO Diff Check

Prüfe ob seit dem letzten Commit SEO-relevante Elemente versehentlich verändert oder entfernt wurden.

## Prüfbereich

Analysiere `git diff HEAD~1` (oder den vom User angegebenen Commit-Bereich) auf Änderungen in:

### Kritisch (sofort melden)
- `<title>` Tags — entfernt oder drastisch verändert?
- `<meta name="description">` — entfernt?
- `<meta name="robots">` — noindex versehentlich hinzugefügt?
- `<link rel="canonical">` — entfernt oder falsche URL?
- `robots.txt` — neue Disallow-Regeln die wichtige Seiten blocken?
- `sitemap.xml` — Seiten entfernt?

### Wichtig
- `<h1>` Tags — entfernt, verdoppelt oder inhaltlich verändert?
- Open Graph Tags (`og:title`, `og:description`, `og:image`) — entfernt?
- JSON-LD Structured Data (`<script type="application/ld+json">`) — entfernt oder kaputt?
- `alt`-Attribute bei Bildern — entfernt?
- Interne Links — wichtige Links entfernt?

### Info
- Neue Seiten ohne SEO-Basics (Title, Description, Canonical)?
- URL-Änderungen ohne Redirects?
- Neue `rel="nofollow"` Links?

## Output

```
🔴 KRITISCH (X Probleme)
  - datei.html: <title> entfernt
  - robots.txt: /wichtige-seite/ jetzt geblockt

🟡 WICHTIG (X Probleme)
  - neue-seite.html: Kein <h1> Tag
  - index.html: og:image URL geändert

🟢 INFO (X Hinweise)
  - neue-seite.html: Keine Meta Description

✅ Keine SEO-Regressionen gefunden.
```

## Hinweis
- Nur Änderungen melden, nicht den gesamten SEO-Status
- Gewollte Änderungen (z.B. Title-Update) nicht als Problem melden — im Zweifel nachfragen
