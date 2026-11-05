#!/usr/bin/env bash
# One customer WhatsApp turn on an API (signed webhook), then the replies Zukki wrote for it.
# usage: scripts/e2e/step.sh <apiUrl> text "hi" | button <id> <title> | list <id> <title> | location <lat> <lng> [address]
# env: CUSTOMER_WA_ID (WhatsApp id with country code; Mexican mobiles carry 521…), WAIT seconds
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
. "$here/env.sh"
since=$(date -u +%Y-%m-%dT%H:%M:%S)
node "$here/wa-customer.mjs" "$@" >/dev/null
sleep "${WAIT:-6}"
psql "$DB_URL" -At -F ' | ' -c "select coalesce(m.body,''), coalesce(m.payload->>'variant','') from messages m join conversations c on c.id=m.conversation_id join customers cu on cu.id=c.customer_id where cu.wa_id='${CUSTOMER_WA_ID:-5215550000001}' and m.sender <> 'customer' and m.created_at >= '$since' order by m.created_at"
