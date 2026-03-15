# myAbiFlow – Hetzner Backend

Migration von Cloudflare Workers/D1 auf einen deutschen Hetzner Cloud Server.

## Architektur

```
Nginx (Port 443) ─→ /api/*      ─→ Express Server (Port 3000)
                 ─→ /session/*   ─→ Gemini WS-Proxy (Port 3001)
                 ─→ /tutor/*     ─→ Flowie Tutor   (Port 3002)
                 ─→ alles andere ─→ Statische Dateien (/var/www/myabiflow/)
```

## Schnellstart (Schritt-für-Schritt)

### 1. Hetzner Server erstellen

1. Account auf [hetzner.com/cloud](https://www.hetzner.com/cloud/) erstellen
2. **Projekt** anlegen: "myAbiFlow"
3. **SSH-Key** hochladen (deinen Public Key von `~/.ssh/id_rsa.pub`)
4. **Server** erstellen:
   - Typ: **CX32** (4 vCPU, 8 GB RAM, 80 GB SSD)
   - Standort: **Nürnberg** (nbg1)
   - Image: **Ubuntu 24.04**
   - SSH-Key: den eben hochgeladenen
   - Firewall: Ports 22, 80, 443 öffnen
5. **Server-IP** notieren

### 2. Managed PostgreSQL erstellen

1. In Hetzner Cloud Console → **Datenbanken**
2. Neue Datenbank erstellen:
   - Typ: **CPX11** (2 vCPU, 2 GB RAM)
   - Standort: **Nürnberg**
   - Datenbank-Name: `myabiflow`
3. **Verbindungs-URL** notieren (Format: `postgresql://user:pass@host:port/myabiflow`)

### 3. Server einrichten

```bash
# Setup-Script auf Server hochladen und ausführen
scp hetzner-backend/scripts/setup-server.sh root@DEINE-IP:/root/
ssh root@DEINE-IP "bash /root/setup-server.sh"
```

### 4. Backend hochladen

```bash
# Vom Projekt-Root aus:
rsync -avz --exclude node_modules --exclude .env hetzner-backend/ root@DEINE-IP:/app/myabiflow-backend/
```

### 5. Konfigurieren

```bash
ssh root@DEINE-IP

# .env erstellen
cd /app/myabiflow-backend
cp .env.example .env
nano .env  # Alle Werte eintragen (API-Keys, DB-URL, etc.)

# Dependencies installieren
npm install --production

# Worker-Code konvertieren (macht den Cloudflare Worker Node.js-kompatibel)
node scripts/convert-worker.js
```

### 6. Datenbank einrichten

```bash
# Schema anlegen
psql -h DB-HOST -U myabiflow -d myabiflow -f config/schema.sql

# Daten von D1 migrieren (lokal auf deinem Mac ausführen!)
cd /Users/sanktanna/Desktop/Abiturtraining/hetzner-backend
node scripts/migrate-data.js
```

### 7. SSL + Nginx

```bash
ssh root@DEINE-IP

# SSL-Zertifikat (Domain muss bereits auf Server-IP zeigen!)
certbot --nginx -d myabiflow.de -d www.myabiflow.de

# Nginx-Config kopieren
cp /app/myabiflow-backend/config/nginx.conf /etc/nginx/sites-available/myabiflow
ln -sf /etc/nginx/sites-available/myabiflow /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl restart nginx
```

### 8. Services starten

```bash
cd /app/myabiflow-backend
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup  # Auto-Start nach Reboot
```

### 9. Statische Dateien deployen

```bash
# Lokal ausführen:
bash build-pages.sh
rsync -avz --delete _site/ root@DEINE-IP:/var/www/myabiflow/
```

### 10. DNS umstellen

In deinem DNS-Provider (Cloudflare DNS, "DNS only" Modus):
- A-Record: `myabiflow.de` → Hetzner-Server-IP
- AAAA-Record: `myabiflow.de` → Hetzner-Server-IPv6
- CNAME: `www.myabiflow.de` → `myabiflow.de`

## Staging-Betrieb

Für Tests vor dem Go-Live:
1. Subdomain `staging.myabiflow.de` → auf Hetzner-IP setzen
2. In Nginx-Config `server_name` auf `staging.myabiflow.de` ändern
3. SSL: `certbot --nginx -d staging.myabiflow.de`
4. In `.env`: `ALLOWED_ORIGIN=https://staging.myabiflow.de`
5. Testen, bis alles funktioniert
6. Dann DNS der Haupt-Domain umstellen

## Wie funktioniert die Worker-Bridge?

Der originale Cloudflare Worker (`src/index.js`, 15.000 Zeilen) wird **nicht** komplett neu geschrieben. Stattdessen:

1. **`src/crypto-polyfill.js`** – Macht `crypto.subtle` (Web Crypto API) in Node.js verfügbar
2. **`src/db-adapter.js`** – Emuliert die D1-API (`env.DB.prepare().bind().first()`) mit PostgreSQL
3. **`src/queue-adapter.js`** – Ersetzt Cloudflare Queues durch BullMQ
4. **`scripts/convert-worker.js`** – Konvertiert `export default {` → `const workerHandlers = {`
5. **`server.js`** – Express-Server der alle `/api/*` Requests an den Worker-Code weiterleitet

So müssen die **Handler-Funktionen und Prompts nicht geändert** werden.

## Befehle

```bash
# Status
pm2 status

# Logs
pm2 logs myabiflow-api
pm2 logs myabiflow-gemini
pm2 logs myabiflow-tutor

# Neustart
pm2 restart all

# Deploy (lokal ausführen)
bash hetzner-backend/scripts/deploy.sh DEINE-IP
```

## Kosten

| Komponente | Produkt | Kosten/Monat |
|------------|---------|-------------|
| Server | CX32 (4 vCPU, 8 GB) | 7,49 EUR |
| Datenbank | Managed PostgreSQL CPX11 | 10,99 EUR |
| Backup | Snapshots | 1,49 EUR |
| **Gesamt** | | **~20 EUR/Monat** |
