#!/usr/bin/env bash
set -Eeuo pipefail

APP_DIR="${APP_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
APP_USER="${APP_USER:-chatbot69}"
NODE_MAJOR="${NODE_MAJOR:-22}"
NEXT_PORT="${NEXT_PORT:-3000}"
RAG_PORT="${RAG_PORT:-8001}"
QDRANT_CONTAINER="${QDRANT_CONTAINER:-chatbot69-qdrant}"
APP_DOMAIN="${APP_DOMAIN:-${DOMAIN:-}}"

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Run with sudo: sudo bash scripts/bootstrap-ubuntu.sh"
  exit 1
fi

if [[ ! -f "$APP_DIR/package.json" ]]; then
  echo "APP_DIR must point to this repository. Current APP_DIR: $APP_DIR"
  exit 1
fi

log() {
  printf '\n[%s] %s\n' "$(date +'%H:%M:%S')" "$*"
}

random_secret() {
  openssl rand -base64 48 | tr -d '\n' | tr '/+' '_-' | cut -c1-48
}

env_value() {
  local key="$1"
  if [[ -f "$APP_DIR/.env" ]]; then
    grep -E "^${key}=" "$APP_DIR/.env" | tail -n1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//' || true
  fi
}

ensure_env() {
  local key="$1"
  local value="$2"
  if ! grep -qE "^${key}=" "$APP_DIR/.env"; then
    printf '%s="%s"\n' "$key" "$value" >> "$APP_DIR/.env"
  fi
}

is_enabled() {
  local value
  value="$(printf '%s' "${1:-}" | tr '[:upper:]' '[:lower:]')"
  [[ "$value" == "1" || "$value" == "true" || "$value" == "yes" || "$value" == "on" ]]
}

set_env() {
  local key="$1"
  local value="$2"
  local escaped
  escaped="$(printf '%s' "$value" | sed -e 's/[\/&|]/\\&/g')"
  if grep -qE "^${key}=" "$APP_DIR/.env"; then
    sed -i "s|^${key}=.*|${key}=\"${escaped}\"|" "$APP_DIR/.env"
  else
    printf '%s="%s"\n' "$key" "$value" >> "$APP_DIR/.env"
  fi
}

log "Installing Ubuntu packages"
export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y ca-certificates curl gnupg openssl build-essential python3 python3-venv python3-pip mysql-server

if ! command -v docker >/dev/null 2>&1; then
  log "Installing Docker"
  if apt-cache policy docker-ce 2>/dev/null | grep -q 'Candidate:'; then
    apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
  else
    apt-get install -y docker.io
  fi
fi

if ! command -v node >/dev/null 2>&1 || [[ "$(node -p 'Number(process.versions.node.split(`.`)[0])')" -lt 20 ]]; then
  log "Installing Node.js ${NODE_MAJOR}.x"
  curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | bash -
  apt-get install -y nodejs
fi

if ! id "$APP_USER" >/dev/null 2>&1; then
  log "Creating service user $APP_USER"
  useradd --system --create-home --shell /usr/sbin/nologin "$APP_USER"
fi

log "Preparing environment file"
if [[ ! -f "$APP_DIR/.env" ]]; then
  cp "$APP_DIR/.env.example" "$APP_DIR/.env"
fi

if [[ -z "$APP_DOMAIN" ]]; then
  APP_DOMAIN="$(env_value APP_DOMAIN)"
fi

if [[ -z "$APP_DOMAIN" ]]; then
  BASE_URL_VALUE="$(env_value BASE_URL)"
  if [[ "$BASE_URL_VALUE" =~ ^https?://([^/:]+) && "${BASH_REMATCH[1]}" != "localhost" && "${BASH_REMATCH[1]}" != "127.0.0.1" ]]; then
    APP_DOMAIN="${BASH_REMATCH[1]}"
  fi
fi

if [[ -n "$APP_DOMAIN" ]]; then
  APP_DOMAIN="${APP_DOMAIN#http://}"
  APP_DOMAIN="${APP_DOMAIN#https://}"
  APP_DOMAIN="${APP_DOMAIN%%/*}"
  APP_DOMAIN="${APP_DOMAIN%%:*}"
fi

DB_NAME="$(env_value DB_NAME)"
DB_NAME="${DB_NAME:-chatbot69}"
DB_USER="$(env_value DB_USER)"
DB_USER="${DB_USER:-chatbot69_user}"
DB_PASSWORD="$(env_value DB_PASSWORD)"
if [[ -z "$DB_PASSWORD" || "$DB_PASSWORD" == "change-me" || "$DB_PASSWORD" == "strong_password_here" ]]; then
  DB_PASSWORD="$(random_secret)"
fi
ADMIN_PASSWORD="$(env_value ADMIN_PASSWORD)"
if [[ -z "$ADMIN_PASSWORD" || "$ADMIN_PASSWORD" == "change-me" || "$ADMIN_PASSWORD" == "admin123" ]]; then
  ADMIN_PASSWORD="$(random_secret)"
fi
NEXT_SECRET="$(env_value NEXT_SERVER_ACTIONS_ENCRYPTION_KEY)"
NEXT_SECRET="${NEXT_SECRET:-$(random_secret)}"
TOKEN_SECRET="$(env_value API_KEY_ENCRYPTION_SECRET)"
TOKEN_SECRET="${TOKEN_SECRET:-$(random_secret)}"
ENABLE_SSL_VALUE="$(env_value ENABLE_SSL)"
ENABLE_SSL_VALUE="${ENABLE_SSL_VALUE:-true}"
SSL_EMAIL_VALUE="$(env_value SSL_EMAIL)"

set_env DB_HOST localhost
set_env DB_PORT 3306
set_env DB_NAME "$DB_NAME"
set_env DB_USER "$DB_USER"
set_env DB_PASSWORD "$DB_PASSWORD"
ensure_env ADMIN_EMAIL admin@example.com
set_env ADMIN_PASSWORD "$ADMIN_PASSWORD"
ensure_env ADMIN_NAME Admin
set_env NEXT_SERVER_ACTIONS_ENCRYPTION_KEY "$NEXT_SECRET"
set_env API_KEY_ENCRYPTION_SECRET "$TOKEN_SECRET"
set_env RAG_SERVICE_URL "http://localhost:${RAG_PORT}"
set_env NEXT_PUBLIC_RAG_SERVICE_URL "http://localhost:${RAG_PORT}"
set_env INTERNAL_APP_URL "http://127.0.0.1:${NEXT_PORT}"
set_env QDRANT_HOST localhost
set_env QDRANT_PORT 6333
if [[ -n "$APP_DOMAIN" ]]; then
  set_env APP_DOMAIN "$APP_DOMAIN"
  set_env BASE_URL "http://${APP_DOMAIN}"
  set_env ENABLE_SSL "$ENABLE_SSL_VALUE"
  ensure_env SSL_EMAIL "$SSL_EMAIL_VALUE"
fi

log "Configuring MySQL"
systemctl enable --now mysql
mysql --protocol=socket -uroot <<SQL
CREATE DATABASE IF NOT EXISTS \`${DB_NAME}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS '${DB_USER}'@'localhost' IDENTIFIED BY '${DB_PASSWORD}';
ALTER USER '${DB_USER}'@'localhost' IDENTIFIED BY '${DB_PASSWORD}';
GRANT ALL PRIVILEGES ON \`${DB_NAME}\`.* TO '${DB_USER}'@'localhost';
FLUSH PRIVILEGES;
SQL

log "Installing JavaScript dependencies"
cd "$APP_DIR"
npm ci

log "Installing Python RAG dependencies"
python3 -m venv "$APP_DIR/rag-service/.venv"
"$APP_DIR/rag-service/.venv/bin/pip" install --upgrade pip
"$APP_DIR/rag-service/.venv/bin/pip" install -r "$APP_DIR/rag-service/requirements.txt"

log "Preparing Qdrant"
systemctl enable --now docker
if ! docker ps -a --format '{{.Names}}' | grep -qx "$QDRANT_CONTAINER"; then
  docker run -d --name "$QDRANT_CONTAINER" --restart unless-stopped -p 6333:6333 -v qdrant_storage:/qdrant/storage qdrant/qdrant:latest
else
  docker start "$QDRANT_CONTAINER" >/dev/null
  docker update --restart unless-stopped "$QDRANT_CONTAINER" >/dev/null
fi

log "Writing systemd services"
cat >/etc/systemd/system/chatbot69-rag.service <<SERVICE
[Unit]
Description=Chatbot69 RAG service
After=network-online.target docker.service
Wants=network-online.target

[Service]
Type=simple
User=$APP_USER
WorkingDirectory=$APP_DIR/rag-service
EnvironmentFile=$APP_DIR/.env
ExecStart=$APP_DIR/rag-service/.venv/bin/python $APP_DIR/rag-service/run.py --host 127.0.0.1 --port $RAG_PORT
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
SERVICE

cat >/etc/systemd/system/chatbot69-web.service <<SERVICE
[Unit]
Description=Chatbot69 Next.js web app
After=network-online.target mysql.service chatbot69-rag.service
Wants=network-online.target chatbot69-rag.service

[Service]
Type=simple
User=$APP_USER
WorkingDirectory=$APP_DIR
EnvironmentFile=$APP_DIR/.env
Environment=NODE_ENV=production
Environment=PORT=$NEXT_PORT
ExecStart=/usr/bin/npm start
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
SERVICE

if [[ -n "$APP_DOMAIN" ]]; then
  log "Configuring Nginx reverse proxy for ${APP_DOMAIN}"
  apt-get install -y nginx
  cat >/etc/nginx/sites-available/chatbot69 <<NGINX
server {
    listen 80;
    listen [::]:80;
    server_name ${APP_DOMAIN};

    client_max_body_size 100m;

    location / {
        proxy_pass http://127.0.0.1:${NEXT_PORT};
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_read_timeout 3600;
        proxy_send_timeout 3600;
        proxy_buffering off;
    }
}
NGINX
  ln -sfn /etc/nginx/sites-available/chatbot69 /etc/nginx/sites-enabled/chatbot69
  rm -f /etc/nginx/sites-enabled/default
  nginx -t
  systemctl enable --now nginx
  systemctl reload nginx

  if is_enabled "$ENABLE_SSL_VALUE"; then
    log "Configuring Let's Encrypt SSL for ${APP_DOMAIN}"
    apt-get install -y certbot python3-certbot-nginx

    CERTBOT_EMAIL_ARGS=(--register-unsafely-without-email)
    if [[ -n "$SSL_EMAIL_VALUE" && "$SSL_EMAIL_VALUE" != "admin@example.com" ]]; then
      CERTBOT_EMAIL_ARGS=(--email "$SSL_EMAIL_VALUE")
    fi

    if [[ ! -f "/etc/letsencrypt/live/${APP_DOMAIN}/fullchain.pem" ]]; then
      certbot --nginx \
        --non-interactive \
        --agree-tos \
        "${CERTBOT_EMAIL_ARGS[@]}" \
        --redirect \
        -d "$APP_DOMAIN"
    else
      certbot install --nginx --cert-name "$APP_DOMAIN" --non-interactive || true
    fi

    systemctl enable --now certbot.timer
    nginx -t
    systemctl reload nginx
    set_env BASE_URL "https://${APP_DOMAIN}"
  fi
fi

chown -R "$APP_USER:$APP_USER" "$APP_DIR"
systemctl daemon-reload
systemctl enable chatbot69-rag chatbot69-web

cat <<EOF

Bootstrap finished.

Before starting the web service for the first time, set real provider values in:
  $APP_DIR/.env

Required provider values:
  API_KEY, API_ENDPOINT, MODEL
  LLM_API_KEY, LLM_ENDPOINT, LLM_MODEL
  EMBEDDING_ENDPOINT if embeddings are enabled

Then build and start on the VPS:
  cd $APP_DIR
  sudo -u $APP_USER npm run build
  sudo systemctl start chatbot69-rag chatbot69-web

Useful checks:
  systemctl status chatbot69-rag chatbot69-web
  journalctl -u chatbot69-web -f
  journalctl -u chatbot69-rag -f

Reverse proxy:
  Domain is read from APP_DOMAIN in .env, or pass it when running:
    sudo env APP_DOMAIN=example.com bash scripts/bootstrap-ubuntu.sh
  Current domain: ${APP_DOMAIN:-not configured}

SSL:
  ENABLE_SSL=${ENABLE_SSL_VALUE}
  SSL_EMAIL=${SSL_EMAIL_VALUE:-not configured}
  HTTPS base URL: $(env_value BASE_URL)
EOF
