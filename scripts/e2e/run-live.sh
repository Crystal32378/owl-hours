#!/usr/bin/env bash
# End to end on the local stack: the customer over signed webhooks, the owner with Maestro in Expo Go.
# env: CUSTOMER_WA_ID (default: a fresh fake number), CUSTOMER_NAME, API (default http://localhost:3000)
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"; repo="$(cd "$here/../.." && pwd)"
. "$here/env.sh"
export CUSTOMER_WA_ID="${CUSTOMER_WA_ID:-5215550$(printf '%06d' $((RANDOM * RANDOM % 1000000)))}"
export CUSTOMER_NAME="${CUSTOMER_NAME:-Lucía}"
api="${API:-http://localhost:3000}"; NORTHSIDE=10000000-0000-4000-8000-000000000001
export JAVA_HOME=/opt/homebrew/opt/openjdk@17
out="${E2E_OUT:-$(mktemp -d)}"; mkdir -p "$out"
say() { echo "== $*"; }
sql() { psql "$DB_URL" -At -c "$1"; }
conv() { sql "select c.id from conversations c join customers cu on cu.id=c.customer_id where cu.wa_id='$CUSTOMER_WA_ID' order by c.created_at desc limit 1"; }
maestro_run() { local log="$out/maestro-$(basename "${@: -1}").log"; (cd "$repo/apps/owner/.maestro" && maestro test --test-output-dir "$out" "$@" >"$log" 2>&1) || { tail -20 "$log"; exit 1; }; }

say "customer $CUSTOMER_WA_ID asks for a plumber"
WAIT=6 "$here/step.sh" "$api" text "hi" >/dev/null
WAIT=5 "$here/step.sh" "$api" list cat_plumbing Plumbing >/dev/null
WAIT=12 "$here/step.sh" "$api" text "My kitchen sink is leaking under the cabinet, water is on the floor. Can someone come today?" >/dev/null
WAIT=6 "$here/step.sh" "$api" button safety_done "Done, no cables" >/dev/null
WAIT=10 "$here/step.sh" "$api" location 21.1619 -86.8515 "Av. Tulum, Cancún" >/dev/null
for _ in 1 2 3; do
  shown=$(sql "select payload->>'business_id' from messages where conversation_id='$(conv)' and payload->>'variant'='suggest_business' order by created_at desc limit 1")
  [ "$shown" = "$NORTHSIDE" ] && break
  WAIT=6 "$here/step.sh" "$api" button another_option "Show another option" >/dev/null
done
WAIT=6 "$here/step.sh" "$api" button "connect:$NORTHSIDE" "Connect me" >/dev/null
title=$(sql "select title from conversations where id='$(conv)'"); say "offer sent: $title, suggested $(sql "select suggested_min||'-'||suggested_max from handoffs where conversation_id='$(conv)'")"

say "owner accepts and quotes (Maestro)"
maestro_run live/relaunch.yaml
maestro_run live/owner-accepts.yaml
maestro_run live/chat-review-quote.yaml
say "job: $(sql "select state from jobs where conversation_id='$(conv)'")"

say "customer approves the visit"
quote=$(sql "select payload->>'quote_id' from messages where conversation_id='$(conv)' and payload->>'variant'='quote' order by created_at desc limit 1")
WAIT=6 "$here/step.sh" "$api" button "quote_approve:$quote" "Approve visit" >/dev/null
state=$(sql "select state from jobs where conversation_id='$(conv)'"); say "job: $state"
JOB_TITLE="$title" maestro_run -e JOB_TITLE="$title" live/jobs-tab.yaml
[ "$state" = customer_approved ] && say "PASS ($out)" || { say "FAIL: job is $state"; exit 1; }
