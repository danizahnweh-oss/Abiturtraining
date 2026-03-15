#!/bin/bash
# ============================================================
# myAbiFlow – Hetzner Server Setup Script
# ============================================================
#
# Dieses Script richtet einen frischen Ubuntu 24.04 Server
# auf Hetzner Cloud komplett ein.
#
# Nutzung:
#   1. Hetzner Cloud Server erstellen (CX32, Ubuntu 24.04, Nürnberg)
#   2. SSH-Verbindung: ssh root@DEINE-SERVER-IP
#   3. Script hochladen: scp setup-server.sh root@IP:/root/
#   4. Ausführen: bash setup-server.sh
#
# Das Script installiert: Node.js 22, Redis, Nginx, PM2,
# Let's Encrypt SSL und richtet alles ein.
# ============================================================

set -e

echo "╔══════════════════════════════════════════╗"
echo "║  myAbiFlow – Hetzner Server Setup        ║"
echo "╚══════════════════════════════════════════╝"
echo ""

# ============================================================
# 1. System aktualisieren
# ============================================================
echo "→ System aktualisieren..."
apt update && apt upgrade -y

# ============================================================
# 2. Node.js 22 LTS installieren
# ============================================================
echo "→ Node.js 22 installieren..."
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt install -y nodejs
echo "  Node.js Version: $(node --version)"
echo "  npm Version: $(npm --version)"

# ============================================================
# 3. PM2 installieren (Prozess-Manager)
# ============================================================
echo "→ PM2 installieren..."
npm install -g pm2

# ============================================================
# 4. Redis installieren
# ============================================================
echo "→ Redis installieren..."
apt install -y redis-server
systemctl enable redis-server
systemctl start redis-server
echo "  Redis Status: $(systemctl is-active redis-server)"

# Redis-Konfiguration: Nur localhost
sed -i 's/^bind .*/bind 127.0.0.1 ::1/' /etc/redis/redis.conf
systemctl restart redis-server

# ============================================================
# 5. Nginx installieren
# ============================================================
echo "→ Nginx installieren..."
apt install -y nginx
systemctl enable nginx

# ============================================================
# 6. Certbot installieren (Let's Encrypt SSL)
# ============================================================
echo "→ Certbot installieren..."
apt install -y certbot python3-certbot-nginx

# ============================================================
# 7. Projektverzeichnisse anlegen
# ============================================================
echo "→ Verzeichnisse anlegen..."
mkdir -p /var/www/myabiflow
mkdir -p /app/myabiflow-backend
mkdir -p /var/log/myabiflow

# ============================================================
# 8. Firewall einrichten
# ============================================================
echo "→ Firewall einrichten..."
apt install -y ufw
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp   # SSH
ufw allow 80/tcp   # HTTP
ufw allow 443/tcp  # HTTPS
ufw --force enable
echo "  Firewall Status: $(ufw status | head -1)"

# ============================================================
# 9. SSH absichern (nur Key-Auth)
# ============================================================
echo "→ SSH absichern..."
# Passwort-Login deaktivieren (nur SSH-Key)
sed -i 's/^#PasswordAuthentication yes/PasswordAuthentication no/' /etc/ssh/sshd_config
sed -i 's/^PasswordAuthentication yes/PasswordAuthentication no/' /etc/ssh/sshd_config
systemctl restart sshd

# ============================================================
# 10. Automatische Sicherheits-Updates
# ============================================================
echo "→ Automatische Updates einrichten..."
apt install -y unattended-upgrades
dpkg-reconfigure -plow unattended-upgrades

# ============================================================
# 11. Log-Rotation einrichten
# ============================================================
echo "→ Log-Rotation einrichten..."
cat > /etc/logrotate.d/myabiflow << 'LOGROTATE'
/var/log/myabiflow/*.log {
    daily
    rotate 14
    compress
    delaycompress
    missingok
    notifempty
    create 0640 root root
    postrotate
        pm2 reloadLogs > /dev/null 2>&1 || true
    endscript
}
LOGROTATE

# ============================================================
# 12. Swap einrichten (für CX22/CX32)
# ============================================================
echo "→ Swap einrichten (2 GB)..."
if [ ! -f /swapfile ]; then
    fallocate -l 2G /swapfile
    chmod 600 /swapfile
    mkswap /swapfile
    swapon /swapfile
    echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

# ============================================================
# FERTIG
# ============================================================
echo ""
echo "╔══════════════════════════════════════════╗"
echo "║  Setup abgeschlossen!                    ║"
echo "╚══════════════════════════════════════════╝"
echo ""
echo "Nächste Schritte:"
echo ""
echo "1. Backend-Code hochladen:"
echo "   scp -r hetzner-backend/ root@SERVER-IP:/app/myabiflow-backend/"
echo ""
echo "2. .env-Datei erstellen:"
echo "   cp /app/myabiflow-backend/.env.example /app/myabiflow-backend/.env"
echo "   nano /app/myabiflow-backend/.env"
echo ""
echo "3. Dependencies installieren:"
echo "   cd /app/myabiflow-backend && npm install"
echo ""
echo "4. Worker-Code konvertieren:"
echo "   node scripts/convert-worker.js"
echo ""
echo "5. Datenbank einrichten:"
echo "   psql -h DB-HOST -U myabiflow -d myabiflow -f config/schema.sql"
echo ""
echo "6. SSL-Zertifikat erstellen:"
echo "   certbot --nginx -d myabiflow.de -d www.myabiflow.de"
echo ""
echo "7. Nginx-Konfiguration kopieren:"
echo "   cp config/nginx.conf /etc/nginx/sites-available/myabiflow"
echo "   ln -s /etc/nginx/sites-available/myabiflow /etc/nginx/sites-enabled/"
echo "   rm /etc/nginx/sites-enabled/default"
echo "   nginx -t && systemctl restart nginx"
echo ""
echo "8. Services starten:"
echo "   cd /app/myabiflow-backend && pm2 start ecosystem.config.cjs"
echo "   pm2 save && pm2 startup"
echo ""
echo "9. Statische Dateien hochladen:"
echo "   rsync -avz _site/ root@SERVER-IP:/var/www/myabiflow/"
echo ""
