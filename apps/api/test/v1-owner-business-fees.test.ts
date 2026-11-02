// PUT /v1/owner/business/fees replaces the caller's extra fees through
// owner_save_fees (odd/tasks/owner-area-map-fees-dark.md S2). The tenant
// comes from the session inside the database function, never from the body.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createApp } from "../src/index.ts";
import type { V1Deps } from "../src/routes/v1.ts";
import { fakeSupabase, type FakeCall, type FakeReply } from "./helpers/fake-supabase.ts";

const MARIO = "20000000-0000-4000-8000-000000000001";
const NIGHT = "60000000-0000-4000-8000-000000000002";
const TOKEN = "owner-access-token-0123456789";
const SERVER_KEY = "server-key-0123456789-0123456789-0123";

const SAVED_BUSINESS = {
  id: "10000000-0000-4000-8000-000000000001",
  fees: [{ id: NIGHT, label: "Night", amount: 30, window: "10 PM-7 AM", atNight: true }],
};

function setup() {
  const owner = fakeSupabase(answersWithBusiness);
  const deps: V1Deps = {
    authenticate: async (token) => (token === TOKEN ? { userId: MARIO, db: owner.client } : null),
    serviceDb: fakeSupabase(() => ({ body: [] })).client,
    serverKey: SERVER_KEY,
  };
  const { app } = createApp({ v1: deps });
  const putFees = (body: unknown) =>
    app.request("/v1/owner/business/fees", {
      method: "PUT",
      headers: { authorization: `Bearer ${TOKEN}`, "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  return { putFees, calls: owner.calls };
}

function answersWithBusiness(call: FakeCall): FakeReply {
  return call.path === "/rest/v1/rpc/owner_save_fees" ? { body: SAVED_BUSINESS } : { status: 500, body: {} };
}

function fee(overrides: Record<string, unknown> = {}) {
  return { label: "Weekend", amount: 15, atNight: false, ...overrides };
}

describe("PUT /v1/owner/business/fees", () => {
  it("replaces the fee list through owner_save_fees and returns the saved business", async () => {
    const { putFees, calls } = setup();
    const fees = [fee({ id: NIGHT, label: "Night", amount: 30, atNight: true }), fee()];

    const res = await putFees({ fees });

    assert.equal(res.status, 200);
    assert.deepEqual(((await res.json()) as { data: unknown }).data, SAVED_BUSINESS);
    assert.equal(calls.length, 1);
    assert.equal(calls[0]?.path, "/rest/v1/rpc/owner_save_fees");
    assert.deepEqual(calls[0]?.body, { p_fees: fees });
  });

  it("saves an empty list, which removes every fee", async () => {
    const { putFees, calls } = setup();

    const res = await putFees({ fees: [] });

    assert.equal(res.status, 200);
    assert.deepEqual(calls[0]?.body, { p_fees: [] });
  });

  it("trims the label it saves", async () => {
    const { putFees, calls } = setup();

    await putFees({ fees: [fee({ label: "  Weekend  " })] });

    assert.deepEqual(calls[0]?.body, { p_fees: [fee()] });
  });

  const refused: [string, unknown][] = [
    ["the same fee id twice", { fees: [fee({ id: NIGHT }), fee({ id: NIGHT, amount: 20 })] }],
    ["a blank label", { fees: [fee({ label: "   " })] }],
    ["a label over 80 characters", { fees: [fee({ label: "x".repeat(81) })] }],
    ["an amount of 0", { fees: [fee({ amount: 0 })] }],
    ["a negative amount", { fees: [fee({ amount: -5 })] }],
    ["a fractional amount", { fees: [fee({ amount: 4.5 })] }],
    ["an amount over 1,000,000", { fees: [fee({ amount: 1_000_001 })] }],
    ["an \"at cost\" amount", { fees: [fee({ amount: "at_cost" })] }],
    ["a fee without the at-night switch", { fees: [{ label: "Weekend", amount: 15 }] }],
    ["an unknown field", { fees: [fee({ window: "10 PM-7 AM" })] }],
    ["more than 20 fees", { fees: Array.from({ length: 21 }, () => fee()) }],
    ["a body without fees", {}],
  ];
  for (const [what, body] of refused) {
    it(`refuses ${what} and writes nothing`, async () => {
      const { putFees, calls } = setup();

      const res = await putFees(body);

      assert.equal(res.status, 400);
      assert.equal(calls.length, 0);
    });
  }
});
