#!/usr/bin/env bash
# Proves the owner screens read and write the owner API on the local stack: each check writes a
# unique value straight to the database, then Maestro waits for the screen to show it; the
# switch check taps in the app, then reads the database. Every value is restored at exit.
# Needs: local Supabase, the API on :3000, Metro on :8081, Expo Go signed in as the demo owner.
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"; repo="$(cd "$here/../.." && pwd)"
# E2E_ENV: another checkout's env.sh (it reads that checkout's apps/api/.env.local), e.g. from a worktree.
. "${E2E_ENV:-$here/env.sh}"
export JAVA_HOME=/opt/homebrew/opt/openjdk@17
out="${E2E_OUT:-$(mktemp -d)}"; mkdir -p "$out"
NORTHSIDE=10000000-0000-4000-8000-000000000001
DRAFT=c0000000-0000-4000-8000-000000000091
marker="E2E$(date +%s)"
say() { echo "== $*"; }
sql() { psql "$DB_URL" -At -c "$1"; }
# Values travel as psql variables (:'value'), so names with quotes or booleans need no escaping.
sql_set() { printf '%s\n' "$2" | psql "$DB_URL" -At -q -v ON_ERROR_STOP=1 -v value="$1"; }
maestro_run() { local log="$out/maestro-$(basename "${@: -1}").log"; (cd "$repo/apps/owner/.maestro" && maestro test --test-output-dir "$out" "$@" >"$log" 2>&1) || { tail -20 "$log"; exit 1; }; }
shows() { maestro_run -e ROUTE="$1" -e MARKER="$2" -e SHOT="$3" live/shows-api-value.yaml; say "PASS $3: the screen shows $2 from the database"; }

name=$(sql "select name from tenants where id='$NORTHSIDE'")
price=$(sql "select item from price_rules where tenant_id='$NORTHSIDE' and kind='repair_range' order by item limit 1")
title=$(sql "select title from content_drafts where id='$DRAFT'")
taking=$(sql "select accepts_now from tenants where id='$NORTHSIDE'")
# Each value is restored on its own, so one failed statement never leaves the others mutated.
restore() {
  set +e
  sql_set "$name" "update tenants set name = :'value' where id = '$NORTHSIDE';"
  sql_set "$taking" "update tenants set accepts_now = :'value'::boolean where id = '$NORTHSIDE';"
  sql_set "$price" "update price_rules set item = :'value' where tenant_id = '$NORTHSIDE' and item = 'Leak $marker';"
  sql_set "$title" "update content_drafts set title = :'value' where id = '$DRAFT';"
}
trap restore EXIT

say "Business tab reads GET /business"
sql_set "Northside $marker" "update tenants set name = :'value' where id = '$NORTHSIDE';"
shows business "Northside $marker" live-business-from-api

say "Prices read GET /business"
sql_set "$price" "update price_rules set item = 'Leak $marker' where tenant_id = '$NORTHSIDE' and item = :'value';"
shows business/prices "Leak $marker" live-prices-from-api

say "Content reads GET /content/drafts"
sql_set "Story $marker" "update content_drafts set title = :'value' where id = '$DRAFT';"
shows content "Story $marker" live-content-from-api

say "Taking requests writes PATCH /business"
maestro_run live/toggle-taking-requests.yaml
# The tap returns before PATCH /business commits: wait up to 15 s for the stored value to change.
for _ in $(seq 1 15); do
  now=$(sql "select accepts_now from tenants where id='$NORTHSIDE'")
  [ "$now" != "$taking" ] && break
  sleep 1
done
[ "$now" != "$taking" ] && say "PASS taking requests: accepts_now $taking -> $now" || { say "FAIL: accepts_now stayed $now"; exit 1; }

say "Hours editor writes PUT /business/hours"
sundays() { sql "select count(*) from business_hours where tenant_id='$NORTHSIDE' and weekday=0"; }
sql "delete from business_hours where tenant_id='$NORTHSIDE' and weekday=0" >/dev/null
maestro_run live/open-sunday-hours.yaml
for _ in $(seq 1 15); do
  [ "$(sundays)" = "1" ] && break
  sleep 1
done
[ "$(sundays)" = "1" ] && say "PASS hours: Sunday stored from the editor" || { say "FAIL: Sunday was not stored"; exit 1; }
sql "delete from business_hours where tenant_id='$NORTHSIDE' and weekday=0" >/dev/null

say "PASS ($out)"
