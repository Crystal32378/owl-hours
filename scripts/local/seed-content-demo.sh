#!/usr/bin/env bash
# Seeds a reviewable Story Pack for the demo owner (mario@northside.example) on the RUNNING local
# stack: uploads the before/after photos to the media bucket, then applies the content demo SQL.
# Safe to run twice. Never resets the database. Usage: scripts/local/seed-content-demo.sh
set -euo pipefail
root="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$root"
eval "$(npx supabase status -o env 2>/dev/null | grep -E '^(API_URL|SERVICE_ROLE_KEY|DB_URL)=')"
[ -n "${DB_URL:-}" ] || { echo "The local stack is not running (scripts/local/up.sh)" >&2; exit 1; }

conversation="40000000-0000-4000-8000-000000000091"
for photo in sink-before sink-after; do
  # x-upsert keeps a second run idempotent instead of failing on the existing object.
  curl -sS --fail-with-body -o /dev/null -X POST \
    "$API_URL/storage/v1/object/media/conversations/$conversation/$photo.jpg" \
    -H "Authorization: Bearer $SERVICE_ROLE_KEY" -H "Content-Type: image/jpeg" -H "x-upsert: true" \
    --data-binary "@scripts/local/content-demo/$photo.jpg"
done

# Through the database container, so a machine with only Docker can run this.
docker exec -i supabase_db_owl-hours psql -U postgres -v ON_ERROR_STOP=1 -q < supabase/seeds/content-demo.sql
echo "Content demo ready: one finished job with before/after photos and one draft to review."
