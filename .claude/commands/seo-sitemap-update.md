---
name: seo-sitemap-update
description: >
  Regenerate sitemap.xml from all HTML pages in the project. Validates entries,
  checks for missing pages, and updates lastmod dates. Use after adding new pages.
---

# Sitemap Update

Generiere die `sitemap.xml` neu aus allen HTML-Seiten im Projekt.

## Schritte

### 1. Seiten sammeln
- Finde alle `.html`-Dateien im Root-Verzeichnis
- Prüfe welche Seiten in der aktuellen `sitemap.xml` stehen
- Ignoriere: Dateien mit `noindex`, Test-/Draft-Seiten, 404.html

### 2. Abgleich
- **Fehlend**: HTML-Seiten die nicht in der Sitemap sind → hinzufügen
- **Verwaist**: Sitemap-Einträge ohne zugehörige HTML-Datei → entfernen
- **Veraltet**: `lastmod` aktualisieren basierend auf Git-History (`git log -1 --format=%cI`)

### 3. Sitemap generieren
- Base-URL: `https://myabiflow.de`
- Format: XML Sitemap Protocol
- `lastmod` im ISO 8601 Format
- `priority` setzen: Startseite 1.0, Hauptseiten 0.8, Unterseiten 0.6
- `changefreq` basierend auf Änderungshäufigkeit

### 4. Validierung
- Wohlgeformtes XML?
- Alle URLs erreichbar (kein 404)?
- Keine Duplikate?
- Stimmt mit `robots.txt` Sitemap-Verweis überein?

### 5. Output
- Aktualisierte `sitemap.xml` schreiben
- Zusammenfassung: hinzugefügte, entfernte, aktualisierte Einträge
- Warnungen bei Problemen

## Wichtig
- Nach dem Update: committen, pushen, deployen (wie in CLAUDE.md definiert)
- Google Search Console Ping ist nicht nötig (Googlebot liest Sitemap automatisch)
