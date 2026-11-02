// Starts the API on PORT (default 3000). The npm scripts pass
// --env-file-if-exists=.env so the keys come from apps/api/.env locally;
// in a deployment they come from the host's environment.
import { readOwnerAppOrigins } from "./http/owner-cors.ts";
import { serve } from "@hono/node-server";
import { createApp } from "./index.ts";
import { readPort, readPollMs } from "./port.ts";
import { startNoticeLoop } from "./orchestrator/notices.ts";
import { startRecoveryLoop } from "./orchestrator/recover.ts";
import { loadRuntimeDeps } from "./v1-live.ts";
import { startOutboxLoop } from "./whatsapp/outbox-loop.ts";

const SHUTDOWN_GRACE_MS = 10_000;
// Accepted / expired / quote notices. pg_cron expires offers once a minute.
const NOTICE_POLL_MS = 5_000;
// Messages a restart dropped: checked on boot, then once a minute.
const RECOVERY_POLL_MS = 60_000;

function main(): void {
  const port = readPort(process.env.PORT);
  const pollMs = readPollMs(process.env.OUTBOX_POLL_MS);
  const live = loadRuntimeDeps();
  if ("unavailable" in live.v1) {
    console.warn(`v1 API disabled (every /v1 call returns 503): ${live.v1.unavailable}`);
  }
  if (!("unavailable" in live.v1) && live.v1.meta && "unavailable" in live.v1.meta) {
    console.warn(`Facebook and Instagram disabled (linking and posting return 503): ${live.v1.meta.unavailable}`);
  }
  if ("unavailable" in live.whatsapp) {
    console.warn(`WhatsApp disabled (webhook returns 503, nothing is sent): ${live.whatsapp.unavailable}`);
  }
  const { app } = createApp({ v1: live.v1, whatsapp: live.whatsapp, ownerAppOrigins: readOwnerAppOrigins(process.env.OWNER_APP_ORIGINS), ownerPublicOrigin: process.env.OWNER_PUBLIC_ORIGIN });
  const server = serve({ fetch: app.fetch, port }, (info) => {
    console.log(`Zukki API listening on port ${info.port}`);
  });
  const outbox = live.outbox && pollMs > 0 ? startOutboxLoop(live.outbox, pollMs) : null;
  if (outbox) {
    console.log(`Sending queued WhatsApp messages every ${pollMs} ms`);
  }
  const notices = live.notices && pollMs > 0 ? startNoticeLoop(live.notices, NOTICE_POLL_MS) : null;
  if (notices) {
    console.log("Zukki answers customers and sends accepted, timeout and quote notices");
  }
  const recovery = live.recovery && pollMs > 0 ? startRecoveryLoop(live.recovery, RECOVERY_POLL_MS) : null;

  const shutdown = (signal: string) => {
    console.log(`${signal} received, closing the server`);
    // Stop taking new connections, let in-flight requests finish, then exit.
    // If something hangs, exit anyway after the grace period.
    setTimeout(() => process.exit(1), SHUTDOWN_GRACE_MS).unref();
    void outbox?.stop();
    void notices?.stop();
    void recovery?.stop();
    server.close((error) => {
      if (error) console.error("Server did not close cleanly", error);
      process.exit(error ? 1 : 0);
    });
  };
  process.once("SIGINT", () => shutdown("SIGINT"));
  process.once("SIGTERM", () => shutdown("SIGTERM"));
}

main();
