#!/usr/bin/env bash
# DevX Boutique OS — one-command local setup.
# Run from the project folder:   bash bootstrap.sh
set -e
cd "$(dirname "$0")"

say() { printf "\n\033[1m▸ %s\033[0m\n" "$1"; }
warn() { printf "\n\033[33m⚠ %s\033[0m\n" "$1"; }
ok() { printf "\033[32m✔ %s\033[0m\n" "$1"; }

# 1. Node
command -v node >/dev/null 2>&1 || { warn "Node.js is not installed. Install Node 20+ from https://nodejs.org and re-run."; exit 1; }
say "Node $(node -v) detected"

# 2. Dependencies
say "Installing dependencies (this can take a minute)…"
npm install

# 3. Environment
if [ ! -f server/.env ]; then cp .env.example server/.env; ok "Created server/.env"; fi
grep -q '^JWT_SECRET=' server/.env || echo 'JWT_SECRET="local-dev-secret-change-me-0123456789"' >> server/.env

# 4. Database
DB_READY=0
if command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1; then
  say "Starting PostgreSQL with Docker…"
  docker compose up -d
  say "Waiting for the database to accept connections…"
  for i in $(seq 1 40); do
    if docker compose exec -T postgres pg_isready -U devx -d devx_boutique >/dev/null 2>&1; then DB_READY=1; break; fi
    sleep 1
  done
  [ "$DB_READY" = 1 ] && ok "PostgreSQL is up (Docker, port 5433)"
elif command -v psql >/dev/null 2>&1; then
  warn "Docker isn't running — using your local PostgreSQL on port 5432 instead."
  createuser -s devx 2>/dev/null || true
  psql -d postgres -c "ALTER USER devx WITH PASSWORD 'devx';" >/dev/null 2>&1 || true
  createdb -O devx devx_boutique 2>/dev/null || true
  # point the app at the local Postgres port
  if grep -q 'localhost:5433' server/.env; then
    sed -i.bak 's/localhost:5433/localhost:5432/' server/.env && rm -f server/.env.bak
  fi
  DB_READY=1
  ok "Using local PostgreSQL (port 5432)"
else
  warn "No database available."
  echo "  Do ONE of these, then re-run  bash bootstrap.sh :"
  echo "    • Open Docker Desktop (wait for the whale icon), OR"
  echo "    • Install PostgreSQL:  brew install postgresql@16 && brew services start postgresql@16"
  exit 1
fi

# 5. Schema + seed
say "Creating the database schema…"
npm run prisma:generate -w server
npm run prisma:deploy -w server 2>/dev/null || npm run db:push -w server
say "Seeding demo data and logins…"
npm run db:seed -w server

cat <<'DONE'

────────────────────────────────────────────────────────
✔ Setup complete.  Start everything with:

     npm run dev

  Customer app → http://localhost:5173
  Jeweller CRM → http://localhost:5174

  CRM login:  owner@aurelia.ae   /   Password123!
  App login:  +971501112233      /   Customer123!
────────────────────────────────────────────────────────
DONE
