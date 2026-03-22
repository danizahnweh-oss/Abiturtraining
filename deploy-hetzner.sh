#!/bin/bash
# ============================================================
# myAbiFlow – Hetzner Deployment Script
# ============================================================
#
# Baut das Projekt lokal und deployed auf den Hetzner Server.
#
# Nutzung:
#   bash deploy-hetzner.sh              # Alles deployen
#   bash deploy-hetzner.sh --frontend   # Nur statische Seiten
#   bash deploy-hetzner.sh --backend    # Nur Backend-Services
#
# ============================================================

set -e

SERVER="root@162.55.62.231"
REMOTE_WEB="/var/www/myabiflow"
REMOTE_BACKEND="/app/myabiflow-backend"
LOCAL_DIR="$(cd "$(dirname "$0")" && pwd)"

# Farben
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

log() { echo -e "${GREEN}→ $1${NC}"; }
warn() { echo -e "${YELLOW}⚠ $1${NC}"; }
err() { echo -e "${RED}✗ $1${NC}"; exit 1; }

# SSH-Verbindung prüfen
ssh -o ConnectTimeout=5 -q $SERVER "exit" || err "Keine SSH-Verbindung zu $SERVER"

DEPLOY_FRONTEND=true
DEPLOY_BACKEND=true

if [ "$1" = "--frontend" ]; then
    DEPLOY_BACKEND=false
elif [ "$1" = "--backend" ]; then
    DEPLOY_FRONTEND=false
fi

# ============================================================
# FRONTEND DEPLOYMENT
# ============================================================
if [ "$DEPLOY_FRONTEND" = true ]; then
    echo ""
    echo "╔══════════════════════════════════════════╗"
    echo "║  Frontend deployen                       ║"
    echo "╚══════════════════════════════════════════╝"

    # 1. Lokal bauen
    log "Baue Projekt lokal..."
    cd "$LOCAL_DIR"
    bash build-pages.sh

    # 2. Auf Server synchronisieren
    log "Synchronisiere nach $SERVER..."
    rsync -avz --delete \
        --exclude='.git' \
        --exclude='node_modules' \
        --exclude='.DS_Store' \
        "$LOCAL_DIR/_site/" "$SERVER:$REMOTE_WEB/"

    # 3. Symlink für Kolloquium sicherstellen
    ssh $SERVER "ln -sfn $REMOTE_WEB/abitur-kolloquium-trainer/dist $REMOTE_WEB/kolloquium"

    log "Frontend deployed!"
fi

# ============================================================
# BACKEND DEPLOYMENT
# ============================================================
if [ "$DEPLOY_BACKEND" = true ]; then
    echo ""
    echo "╔══════════════════════════════════════════╗"
    echo "║  Backend deployen                        ║"
    echo "╚══════════════════════════════════════════╝"

    # 1. Backend-Dateien synchronisieren
    log "Synchronisiere Backend-Code..."
    rsync -avz --delete \
        --exclude='node_modules' \
        --exclude='.env' \
        --exclude='.DS_Store' \
        "$LOCAL_DIR/hetzner-backend/" "$SERVER:$REMOTE_BACKEND/" \
        2>/dev/null || {
        # Falls lokaler Backend-Ordner nicht existiert, Server-Code beibehalten
        warn "Kein lokaler Backend-Ordner — überspringe rsync"
    }

    # 1b. Modularen Worker-Code (src/) synchronisieren
    log "Synchronisiere Worker-Code (src/)..."
    rsync -avz --delete \
        --exclude='index.original.js' \
        --exclude='.DS_Store' \
        "$LOCAL_DIR/src/" "$SERVER:/app/src/"

    # 2. Dependencies installieren (nur wenn package.json sich geändert hat)
    log "Prüfe Dependencies..."
    ssh $SERVER "cd $REMOTE_BACKEND && npm ci --production 2>&1 | tail -3"

    # 3. Services neustarten
    log "Starte Services neu..."
    ssh $SERVER "pm2 restart all && sleep 2 && pm2 list"

    log "Backend deployed!"
fi

# ============================================================
# ABSCHLUSS
# ============================================================
echo ""
echo "╔══════════════════════════════════════════╗"
echo "║  Deployment abgeschlossen!               ║"
echo "╚══════════════════════════════════════════╝"
echo ""
log "Health-Check..."
STATUS=$(curl -s -o /dev/null -w "%{http_code}" https://staging.myabiflow.de/)
API=$(curl -s https://staging.myabiflow.de/health 2>/dev/null)

if [ "$STATUS" = "200" ]; then
    log "Frontend: ✅ OK ($STATUS)"
else
    warn "Frontend: ❌ Status $STATUS"
fi

if echo "$API" | grep -q '"ok"'; then
    log "API: ✅ OK"
else
    warn "API: ❌ $API"
fi

echo ""
log "Live: https://staging.myabiflow.de"
