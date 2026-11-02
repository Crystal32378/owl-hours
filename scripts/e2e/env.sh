# Sourced by the e2e scripts: the local API env (META_APP_SECRET) and the local Supabase URLs.
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
set -a
. "$root/apps/api/.env.local"
eval "$(cd "$root" && npx supabase status -o env 2>/dev/null | grep -E '^(API_URL|ANON_KEY|DB_URL|MAILPIT_URL)=')"
set +a
# The API this drives must use the fake WhatsApp, or each run messages real numbers.
case "${WHATSAPP_GRAPH_HOST:-}" in
  http://127.0.0.1:*|http://localhost:*) ;;
  *)
    [ -n "${E2E_REAL_WHATSAPP:-}" ] || {
      echo "apps/api/.env.local has no local WHATSAPP_GRAPH_HOST, so this e2e would message real numbers." >&2
      echo "See docs/USAGE.md, or set E2E_REAL_WHATSAPP=1 to do that on purpose." >&2
      exit 1
    }
    ;;
esac
