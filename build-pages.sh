#!/bin/bash
# Build-Script für Cloudflare Pages
# Sammelt alle statischen Dateien in _site/ und baut den Kolloquiumstrainer

set -e

echo "=== myAbiFlow – Cloudflare Pages Build ==="

# 1. Kolloquiumstrainer bauen
echo "→ Baue Kolloquiumstrainer..."
cd abitur-kolloquium-trainer
npm ci --prefer-offline
npm run build
cd ..

# 2. Altes _site/ aufräumen
echo "→ Erstelle _site/ Verzeichnis..."
rm -rf _site
mkdir -p _site

# 3. Statische HTML-Dateien kopieren
echo "→ Kopiere HTML-Dateien..."
cp *.html _site/

# 4. CSS, JS, JSON kopieren
echo "→ Kopiere CSS, JS, JSON..."
cp *.css _site/
cp *.js _site/
cp manifest.json _site/

# 5. Bilder kopieren
echo "→ Kopiere Bilder..."
cp *.png _site/ 2>/dev/null || true

# 6. Videos kopieren
echo "→ Kopiere Videos..."
cp *.mp4 _site/ 2>/dev/null || true

# 7. Lehrpläne kopieren
echo "→ Kopiere Lehrpläne..."
cp -r lehrplaene _site/

# 8. Kolloquiumstrainer dist/ an den richtigen Pfad kopieren
echo "→ Kopiere Kolloquiumstrainer-Build..."
mkdir -p _site/abitur-kolloquium-trainer
cp -r abitur-kolloquium-trainer/dist _site/abitur-kolloquium-trainer/dist

# 9. CNAME wird NICHT kopiert (Cloudflare Pages braucht kein CNAME-File)

echo ""
echo "=== Build fertig! ==="
echo "Dateien in _site/:"
ls -la _site/ | head -30
echo ""
echo "Kolloquiumstrainer:"
ls -la _site/abitur-kolloquium-trainer/dist/ | head -10
