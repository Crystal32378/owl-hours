#!/usr/bin/env bash
# Runs the whole product on this machine with no accounts and no keys: local Supabase with the seed,
# the API, a fake WhatsApp, the owner app on the web, and one customer walked through the demo.
# Without META_MODEL_API_KEY the models are answers recorded from real runs, and the API logs that.
# With it, the same run calls Meta. Writes only to a temp folder: developers' env files stay untouched.
# The owner app is a production web build: development overlays cover its buttons.
# Needs: Docker running, Node 24, pnpm install, ffmpeg. Stop with Ctrl+C.
set -euo pipefail
root="$(cd "$(dirname "$0")/../.." && pwd)"
run_dir="$(mktemp -d)"
START_TIMEOUT_SECONDS=120
pids=()
stop_everything() {
  [ ${#pids[@]} -eq 0 ] || kill "${pids[@]}" 2>/dev/null || true
  rm -rf "$run_dir"
}
trap stop_everything EXIT
trap 'exit 130' INT TERM

for tool in docker ffmpeg; do
  command -v "$tool" >/dev/null || { echo "$tool is required (see docs/USAGE.md)" >&2; exit 1; }
done
docker info >/dev/null 2>&1 || { echo "Docker is not running" >&2; exit 1; }

cd "$root"
echo "Starting local Supabase (the first run downloads its images)..."
npx supabase start >/dev/null
npx supabase migration up --local >/dev/null
bash scripts/local/seed-content-demo.sh >/dev/null
eval "$(npx supabase status -o env 2>/dev/null | grep -E '^(API_URL|ANON_KEY|SERVICE_ROLE_KEY|MAILPIT_URL)=')"

models_note="live: this run calls Meta with your key"
if [ -z "${META_MODEL_API_KEY:-}" ]; then
  models_note="REPLAY: answers recorded from real runs, only for the sample video and the demo script"
  export META_MODEL_API_KEY="no-key-this-run-replays-recordings"
  export META_MODEL_BASE_URL="http://127.0.0.1:4011/v1"
  node scripts/local/replay-models.mjs > "$run_dir/models.log" 2>&1 &
  pids+=($!)
fi

export WHATSAPP_ACCESS_TOKEN="fake-$(openssl rand -hex 16)"
export WHATSAPP_PHONE_NUMBER_ID="100000000000001"
export WHATSAPP_VERIFY_TOKEN="fake-$(openssl rand -hex 16)"
export META_APP_SECRET="fake-$(openssl rand -hex 16)"
cat > "$run_dir/api.env" <<ENV
WHATSAPP_GRAPH_HOST=http://127.0.0.1:4010
SUPABASE_URL=$API_URL
SUPABASE_ANON_KEY=$ANON_KEY
SUPABASE_SERVICE_ROLE_KEY=$SERVICE_ROLE_KEY
ZUKKI_SERVER_KEY=$(openssl rand -hex 32)
OWNER_APP_ORIGINS=http://localhost:8081
OWNER_PUBLIC_ORIGIN=http://localhost:8081
PORT=3000
ENV

node scripts/local/fake-whatsapp.mjs > "$run_dir/whatsapp.log" 2>&1 &
pids+=($!)
(cd apps/api && exec node --env-file="$run_dir/api.env" src/server.ts) > "$run_dir/api.log" 2>&1 &
pids+=($!)
echo "Building the owner app..."
(cd apps/owner && CI=1 EXPO_PUBLIC_API_URL=http://localhost:3000 EXPO_PUBLIC_SUPABASE_URL="$API_URL" \
  EXPO_PUBLIC_SUPABASE_ANON_KEY="$ANON_KEY" EXPO_PUBLIC_STORY_PACK_MODE=live \
  npx expo export --platform web --output-dir "$run_dir/owner" > "$run_dir/owner-build.log" 2>&1) \
  || { tail -20 "$run_dir/owner-build.log" >&2; exit 1; }
node scripts/local/serve-owner-web.mjs "$run_dir/owner" 8081 > "$run_dir/owner.log" 2>&1 &
pids+=($!)

for url in http://localhost:3000/health http://127.0.0.1:4010/sent http://localhost:8081/; do
  waited=0
  until curl -sf -o /dev/null "$url"; do
    sleep 1
    waited=$((waited + 1))
    if [ "$waited" -ge "$START_TIMEOUT_SECONDS" ]; then
      echo "$url did not answer within $START_TIMEOUT_SECONDS s. Logs:" >&2
      tail -n 20 "$run_dir"/*.log >&2
      exit 1
    fi
  done
done

echo; echo "A customer sends a leak video:"
node scripts/e2e/demo-customer.mjs

cat <<INFO

Everything is running. Models: $models_note
API log: $run_dir/api.log (removed when this stops)

  Customer's messages   http://127.0.0.1:4010
  Owner app             http://localhost:8081
    Sign in with mario@northside.example; the code arrives in $MAILPIT_URL
    The request has 5 minutes to be accepted, then Zukki offers it to the next business.

Press Enter to send another customer (a request lasts 5 minutes). Ctrl+C stops everything.
INFO
while read -r _; do
  node scripts/e2e/demo-customer.mjs || echo "That customer failed; see the messages above." >&2
done
wait
