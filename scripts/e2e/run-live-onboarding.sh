#!/usr/bin/env bash
# A new owner signs up and finishes onboarding in Expo Go on the local stack; the database must then
# hold their business (category as typed, in key form) with them as its owner. The demo owner signs
# back in at the end. Needs: local Supabase with Mailpit, the API on :3000, Metro on :8081.
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"; repo="$(cd "$here/../.." && pwd)"
# E2E_ENV: another checkout's env.sh (it reads that checkout's apps/api/.env.local), e.g. from a worktree.
. "${E2E_ENV:-$here/env.sh}"
export JAVA_HOME=/opt/homebrew/opt/openjdk@17
out="${E2E_OUT:-$(mktemp -d)}"; mkdir -p "$out"
stamp="$(date +%s)"
email="owner-$stamp@e2e.example"
business="Plomería Sur $stamp"
say() { echo "== $*"; }
sql() { psql "$DB_URL" -At -c "$1"; }
maestro_run() { local log="$out/maestro-$(basename "${@: -1}").log"; (cd "$repo/apps/owner/.maestro" && maestro test --test-output-dir "$out" "$@" >"$log" 2>&1) || { tail -20 "$log"; exit 1; }; }

# Whatever happens to the new owner, the demo owner signs back in, so the other e2e scripts still run.
# The throwaway owner's account and business stay in the local database (they only ever exist locally).
sign_demo_owner_back_in() {
  say "demo owner signs back in"
  maestro_run -e OWNER_EMAIL=mario@northside.example -e MAILPIT_URL="$MAILPIT_URL" live/sign-out-and-in.yaml
}
trap sign_demo_owner_back_in EXIT

# The simulator reports a fixed position and Expo Go already has location permission, so the
# area step's "Use my current location" saves this point without a system prompt.
DEVICE=${DEVICE:-booted}
xcrun simctl location "$DEVICE" set 21.1619,-86.8515
xcrun simctl privacy "$DEVICE" grant location host.exp.Exponent

say "new owner $email signs up and onboards"
maestro_run -e NEW_EMAIL="$email" -e BUSINESS_NAME="$business" -e CATEGORY="Plomería" -e MAILPIT_URL="$MAILPIT_URL" live/new-owner-onboarding.yaml

row=$(sql "select t.category || '|' || tu.role || '|' || (select count(*) from service_areas a where a.tenant_id = t.id)
           || '|' || round(st_y(t.location::geometry)::numeric, 3) || ',' || round(st_x(t.location::geometry)::numeric, 3)
           from tenants t join tenant_users tu on tu.tenant_id = t.id join auth.users u on u.id = tu.user_id
           where u.email = '$email'")
say "database: category|role|service areas|location = $row"

expected="plomeria|owner|1|21.162,-86.852"
[ "$row" = "$expected" ] && say "PASS ($out)" || { say "FAIL: expected $expected"; exit 1; }
