#!/bin/bash
# ============================================================
# myAbiFlow – Deploy Script (lokal ausführen)
# ============================================================
#
# Deployt statische Dateien + Backend auf den Hetzner Server.
#
# Nutzung:
#   bash hetzner-backend/scripts/deploy.sh SERVER-IP
#
# Beispiel:
#   bash hetzner-backend/scripts/deploy.sh 162.55.100.42
# ============================================================

set -e

SERVER_IP="${1:?Bitte Server-IP angeben: bash deploy.sh 162.55.100.42}"
SERVER_USER="root"
PROJECT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"

echo "╔══════════════════════════════════════════╗"
echo "║  myAbiFlow – Deploy auf Hetzner          ║"
echo "║  Server: ${SERVER_IP}                    ║"
echo "╚══════════════════════════════════════════╝"
echo ""

# ============================================================
# 1. Statische Seiten bauen
# ============================================================
echo "→ Baue statische Seiten..."
cd "$PROJECT_DIR"
bash build-pages.sh

# ============================================================
# 2. Statische Dateien hochladen
# ============================================================
echo "→ Lade statische Dateien hoch..."
rsync -avz --delete \
  --exclude '.DS_Store' \
  "$PROJECT_DIR/_site/" \
  "${SERVER_USER}@${SERVER_IP}:/var/www/myabiflow/"

# ============================================================
# 3. Backend-Code hochladen
# ============================================================
echo "→ Lade Backend-Code hoch..."
rsync -avz --delete \
  --exclude 'node_modules' \
  --exclude '.env' \
  --exclude 'src/worker-original.js' \
  "$PROJECT_DIR/hetzner-backend/" \
  "${SERVER_USER}@${SERVER_IP}:/app/myabiflow-backend/"

# ============================================================
# 4. Worker-Code konvertieren + Dependencies
# ============================================================
echo "→ Konvertiere Worker-Code + installiere Dependencies..."
ssh "${SERVER_USER}@${SERVER_IP}" << 'REMOTE'
  cd /app/myabiflow-backend
  npm install --production
  node scripts/convert-worker.js
  pm2 restart all 2>/dev/null || echo "PM2 nicht gestartet – starte mit: pm2 start ecosystem.config.cjs"
REMOTE

echo ""
echo "╔══════════════════════════════════════════╗"
echo "║  Deploy abgeschlossen!                   ║"
echo "╚══════════════════════════════════════════╝"
echo ""
echo "Prüfe: https://myabiflow.de/health"
echo ""
