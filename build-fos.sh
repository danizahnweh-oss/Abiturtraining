#!/bin/bash
# Build-Script für FOS-Website (myabiflow.com)
# Sammelt alle FOS-Dateien + shared Files in _site-fos/

set -e

echo "=== myAbiFlow FOS – Cloudflare Pages Build ==="

# 1. Altes _site-fos/ aufräumen
echo "→ Erstelle _site-fos/ Verzeichnis..."
rm -rf _site-fos
mkdir -p _site-fos

# 2. FOS-Dateien kopieren
echo "→ Kopiere FOS-Dateien..."
cp fos/*.html _site-fos/
cp fos/*.css _site-fos/ 2>/dev/null || true
cp fos/*.js _site-fos/ 2>/dev/null || true
cp fos/*.json _site-fos/ 2>/dev/null || true
cp fos/*.png _site-fos/ 2>/dev/null || true

# 3. Shared Files aus Root kopieren
echo "→ Kopiere shared Files..."
cp shared.js _site-fos/
cp shared-v4.css _site-fos/
cp tour.js _site-fos/ 2>/dev/null || true
cp ai-tutor.js _site-fos/ 2>/dev/null || true
cp logo.png _site-fos/ 2>/dev/null || true

# 4. Fonts kopieren (lokal, DSGVO-konform)
echo "→ Kopiere Fonts..."
cp -r fonts _site-fos/

# 5. Bilder/Videos aus Root kopieren (falls benötigt)
echo "→ Kopiere Bilder..."
cp *.png _site-fos/ 2>/dev/null || true

echo ""
echo "=== FOS Build fertig! ==="
echo "Dateien in _site-fos/:"
ls -la _site-fos/ | head -30
echo ""
echo "Deploy mit: npx wrangler pages deploy _site-fos --project-name=myabiflow-fos"
