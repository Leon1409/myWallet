#!/usr/bin/env bash
# Punkt startowy addonu: czyta opcje z /data/options.json (wpisane w UI HA)
# i eksportuje je jako zmienne środowiskowe dla serwera Node.
set -e

OPTS=/data/options.json
export DATABASE_URL="$(jq -r '.database_url // empty' "$OPTS")"
export PG_POOL_MAX="$(jq -r '.pg_pool_max // 5' "$OPTS")"
export AI_API_KEY="$(jq -r '.ai_api_key // empty' "$OPTS")"
export AI_BASE_URL="$(jq -r '.ai_base_url // empty' "$OPTS")"
export AI_MODEL="$(jq -r '.ai_model // empty' "$OPTS")"
export PORT=4000

# JWT_SECRET: jeśli pusty w opcjach — wygeneruj raz i zapisz w /data
# (przetrwa restarty addonu; tokeny użytkowników pozostają ważne)
JWT="$(jq -r '.jwt_secret // empty' "$OPTS")"
if [ -z "$JWT" ]; then
  if [ ! -s /data/jwt_secret ]; then
    node -e "console.log(require('crypto').randomBytes(32).toString('hex'))" > /data/jwt_secret
  fi
  JWT="$(cat /data/jwt_secret)"
fi
export JWT_SECRET="$JWT"

if [ -z "$DATABASE_URL" ]; then
  echo "❌ Brak database_url — uzupełnij konfigurację addonu w Home Assistant"
  exit 1
fi

exec node src/index.js
