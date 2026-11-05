// S3: Tests for suggestedQuoteFor:
// - local-hour conversion from the tenant timezone (UTC hour and local hour differ, and crossing midnight)
// - price_rules row parsing (valid rows, and zod parse rejection such as numeric-as-string amount or null timezone)
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";
import { suggestedQuoteFor } from "../src/services/whatsapp-service.ts";
import { fakeSupabase, pgError } from "./helpers/fake-supabase.ts";

const BUSINESS = "10000000-0000-4000-8000-000000000001";

describe("suggestedQuoteFor (S3)", () => {
  it("converts UTC time to tenant timezone when UTC hour and local hour differ", async () => {
    // 2026-10-31 15:00:00 UTC is 10:00:00 in America/Bogota (UTC-5)
    // Day time (hour 10): night fee should not be included.
    const now = new Date("2026-10-31T15:00:00.000Z");
    const { client } = fakeSupabase((call) => {
      if (call.path.startsWith("/rest/v1/tenants")) {
        return { body: { timezone: "America/Bogota" } };
      }
      if (call.path.startsWith("/rest/v1/price_rules")) {
        return {
          body: [
            { item: "Visit", kind: "callout", min_amount: 45, max_amount: 45, conditions: null },
            { item: "Night fee", kind: "night_fee", min_amount: 25, max_amount: 25, conditions: "10 PM-7 AM" },
            { item: "Leak repair", kind: "repair_range", min_amount: 60, max_amount: 90, conditions: null },
          ],
        };
      }
      return { body: [] };
    });

    const quote = await suggestedQuoteFor(client as SupabaseClient, BUSINESS, now);
    // At hour 10: 45 + 60 to 45 + 90 => 105 to 135
    assert.deepEqual(quote, { min: 105, max: 135 });
  });

  it("converts UTC time across midnight for tenant timezone", async () => {
    // 2026-10-31 03:00:00 UTC is 2026-10-30 22:00:00 in America/Bogota (UTC-5) (previous day, 10 PM)
    // 10 PM (hour 22): night fee applies!
    const now = new Date("2026-10-31T03:00:00.000Z");
    const { client } = fakeSupabase((call) => {
      if (call.path.startsWith("/rest/v1/tenants")) {
        return { body: { timezone: "America/Bogota" } };
      }
      if (call.path.startsWith("/rest/v1/price_rules")) {
        return {
          body: [
            { item: "Visit", kind: "callout", min_amount: 45, max_amount: 45, conditions: null },
            { item: "Night fee", kind: "night_fee", min_amount: 25, max_amount: 25, conditions: "10 PM-7 AM" },
            { item: "Leak repair", kind: "repair_range", min_amount: 60, max_amount: 90, conditions: null },
          ],
        };
      }
      return { body: [] };
    });

    const quote = await suggestedQuoteFor(client as SupabaseClient, BUSINESS, now);
    // At hour 22: 45 + 60 + 25 to 45 + 90 + 25 => 130 to 160
    assert.deepEqual(quote, { min: 130, max: 160 });
  });

  it("parses price_rules correctly and returns null when no callout or repair rule exists", async () => {
    const now = new Date("2026-10-31T15:00:00.000Z");
    const { client } = fakeSupabase((call) => {
      if (call.path.startsWith("/rest/v1/tenants")) {
        return { body: { timezone: "America/Bogota" } };
      }
      if (call.path.startsWith("/rest/v1/price_rules")) {
        return {
          body: [
            { item: "Night fee", kind: "night_fee", min_amount: 25, max_amount: 25, conditions: "10 PM-7 AM" },
          ],
        };
      }
      return { body: [] };
    });

    const quote = await suggestedQuoteFor(client as SupabaseClient, BUSINESS, now);
    assert.equal(quote, null);
  });

  it("rejects when price_rules row has numeric-as-string amount (zod validation error)", async () => {
    const now = new Date("2026-10-31T15:00:00.000Z");
    const { client } = fakeSupabase((call) => {
      if (call.path.startsWith("/rest/v1/tenants")) {
        return { body: { timezone: "America/Bogota" } };
      }
      if (call.path.startsWith("/rest/v1/price_rules")) {
        return {
          body: [
            { item: "Visit", kind: "callout", min_amount: "45", max_amount: 45, conditions: null },
          ],
        };
      }
      return { body: [] };
    });

    await assert.rejects(
      () => suggestedQuoteFor(client as SupabaseClient, BUSINESS, now),
      (err: Error) => {
        assert.match(err.name, /ZodError/);
        return true;
      },
    );
  });

  it("rejects when tenant timezone is null or missing", async () => {
    const now = new Date("2026-10-31T15:00:00.000Z");
    const { client } = fakeSupabase((call) => {
      if (call.path.startsWith("/rest/v1/tenants")) {
        return { body: { timezone: null } };
      }
      return { body: [] };
    });

    await assert.rejects(
      () => suggestedQuoteFor(client as SupabaseClient, BUSINESS, now),
      (err: Error) => {
        assert.match(err.name, /ZodError/);
        return true;
      },
    );
  });

  it("rejects when tenant timezone is invalid (Intl RangeError)", async () => {
    const now = new Date("2026-10-31T15:00:00.000Z");
    const { client } = fakeSupabase((call) => {
      if (call.path.startsWith("/rest/v1/tenants")) {
        return { body: { timezone: "Invalid/Timezone" } };
      }
      if (call.path.startsWith("/rest/v1/price_rules")) {
        return { body: [] };
      }
      return { body: [] };
    });

    await assert.rejects(
      () => suggestedQuoteFor(client as SupabaseClient, BUSINESS, now),
      (err: Error) => {
        assert(err instanceof RangeError);
        return true;
      },
    );
  });

  it("rejects when database call fails", async () => {
    const now = new Date("2026-10-31T15:00:00.000Z");
    const { client } = fakeSupabase((call) => {
      if (call.path.startsWith("/rest/v1/tenants")) {
        return pgError("PGRST500", "database error", 500);
      }
      return { body: [] };
    });

    await assert.rejects(() => suggestedQuoteFor(client as SupabaseClient, BUSINESS, now));
  });
});
