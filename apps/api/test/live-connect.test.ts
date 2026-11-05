// S1, S2: If computing the quote suggestion throws, connect still creates the
// offer with no suggested range (min/max undefined) and returns { expiresAt }.
// The failure is logged once with the business id and the error.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createDirectory } from "../src/orchestrator/live.ts";
import { fakeSupabase } from "./helpers/fake-supabase.ts";

const CONVERSATION = "30000000-0000-4000-8000-000000000001";
const BUSINESS = "10000000-0000-4000-8000-000000000001";
const EXPIRES_AT = "2026-10-31T00:05:00.000Z";

function captureWarnings() {
  const warnings: string[] = [];
  const original = console.warn;
  console.warn = (...args: unknown[]) => {
    warnings.push(args.map((part) => (typeof part === "object" ? JSON.stringify(part) : String(part))).join(" "));
  };
  return { warnings, restore: () => void (console.warn = original) };
}

describe("createDirectory connect (S1, S2)", () => {
  it("connects without suggested range when suggestedQuoteFor throws (e.g. DB error), logging the failure", async () => {
    let handoffBody: Record<string, unknown> | null = null;
    const { client } = fakeSupabase((call) => {
      if (call.path.startsWith("/rest/v1/tenants")) {
        return { status: 500, body: { message: "db down" } };
      }
      if (call.path === "/rest/v1/rpc/create_handoff") {
        handoffBody = call.body as Record<string, unknown>;
        return { body: { id: "40000000-0000-4000-8000-000000000001", attempt: 1, expires_at: EXPIRES_AT, distance_km: 1.2 } };
      }
      return { body: [] };
    });

    const { warnings, restore } = captureWarnings();
    try {
      const directory = createDirectory(client as SupabaseClient);
      const result = await directory.connect(CONVERSATION, BUSINESS);

      assert.equal(result.expiresAt, EXPIRES_AT);
      assert.deepEqual(handoffBody, {
        p_conversation_id: CONVERSATION,
        p_tenant_id: BUSINESS,
        p_suggested_min: null,
        p_suggested_max: null,
      });

      const quoteWarnings = warnings.filter((w) => w.includes("suggested quote"));
      assert.equal(quoteWarnings.length, 1);
      assert.match(quoteWarnings[0] ?? "", new RegExp(BUSINESS));
    } finally {
      restore();
    }
  });

  it("connects with suggested min and max when suggestedQuoteFor succeeds", async () => {
    let handoffBody: Record<string, unknown> | null = null;
    const { client } = fakeSupabase((call) => {
      if (call.path.startsWith("/rest/v1/tenants")) {
        return { body: { timezone: "America/Bogota" } };
      }
      if (call.path.startsWith("/rest/v1/price_rules")) {
        return {
          body: [
            { item: "Visit", kind: "callout", min_amount: 50, max_amount: 50, conditions: null },
            { item: "Repair", kind: "repair_range", min_amount: 100, max_amount: 150, conditions: null },
          ],
        };
      }
      if (call.path === "/rest/v1/rpc/create_handoff") {
        handoffBody = call.body as Record<string, unknown>;
        return { body: { id: "40000000-0000-4000-8000-000000000001", attempt: 1, expires_at: EXPIRES_AT, distance_km: 1.2 } };
      }
      return { body: [] };
    });

    const { warnings, restore } = captureWarnings();
    try {
      const directory = createDirectory(client as SupabaseClient);
      const result = await directory.connect(CONVERSATION, BUSINESS);

      assert.equal(result.expiresAt, EXPIRES_AT);
      assert.deepEqual(handoffBody, {
        p_conversation_id: CONVERSATION,
        p_tenant_id: BUSINESS,
        p_suggested_min: 150,
        p_suggested_max: 200,
      });
      // The push notification in connectBusiness logs a warning if push fails, but no quote suggestion warning
      assert.equal(warnings.some((w) => w.includes("suggested quote")), false);
    } finally {
      restore();
    }
  });
});
