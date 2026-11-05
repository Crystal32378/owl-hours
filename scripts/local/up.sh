#!/usr/bin/env bash
# Starts the local stack (Supabase in Docker with every migration and the seed) and writes the
# env files the API and the owner app read in local mode. Secrets (WhatsApp, Meta) come from the
# API's own env file; Supabase points at the local stack. Usage: scripts/local/up.sh [secrets-env]
set -euo pipefail
root="$(cd "$(dirname "$0")/../.." && pwd)"
secrets="${1:-}"
if [ -z "$secrets" ]; then
  for candidate in "$root/apps/api/.env" "$root/apps/api/src/.env"; do
    [ -f "$candidate" ] && secrets="$candidate" && break
  done
fi
[ -n "$secrets" ] || { echo "No API env file with the WhatsApp and Meta secrets (apps/api/.env)" >&2; exit 1; }

cd "$root"
npx supabase start >/dev/null
eval "$(npx supabase status -o env 2>/dev/null | grep -E '^(API_URL|ANON_KEY|SERVICE_ROLE_KEY|DB_URL|MAILPIT_URL)=')"

grep -vE '^(SUPABASE_URL|SUPABASE_ANON_KEY|SUPABASE_SERVICE_ROLE_KEY|OWNER_APP_ORIGINS|OWNER_PUBLIC_ORIGIN|PORT)=' "$secrets" > apps/api/.env.local
cat >> apps/api/.env.local <<ENV
SUPABASE_URL=$API_URL
SUPABASE_ANON_KEY=$ANON_KEY
SUPABASE_SERVICE_ROLE_KEY=$SERVICE_ROLE_KEY
OWNER_APP_ORIGINS=http://localhost:8081
OWNER_PUBLIC_ORIGIN=http://localhost:8081
PORT=3000
ENV
cat > apps/owner/.env.local <<ENV
EXPO_PUBLIC_API_URL=http://localhost:3000
EXPO_PUBLIC_SUPABASE_URL=$API_URL
EXPO_PUBLIC_SUPABASE_ANON_KEY=$ANON_KEY
EXPO_PUBLIC_STORY_PACK_MODE=live
ENV
chmod 600 apps/api/.env.local apps/owner/.env.local

cat <<INFO
Local stack is up.
  Supabase Studio  http://127.0.0.1:54323
  Sign-in emails   $MAILPIT_URL   (demo owner: mario@northside.example)
  Database         $DB_URL
Next:
  npm run dev:api:local     # API on http://localhost:3000 against the local stack
  npm run dev:owner         # owner app (web on http://localhost:8081, Expo Go with the QR)
INFO
