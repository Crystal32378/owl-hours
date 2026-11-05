// Owner business endpoints: the profile, prices, hours, service area and
// switches of the caller's own business. The tenant always comes from the
// session inside the database functions, never from the request.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createApp } from "../src/index.ts";
import type { V1Deps } from "../src/routes/v1.ts";
import { fakeSupabase, pgError, type FakeCall, type FakeReply } from "./helpers/fake-supabase.ts";

const MARIO = "20000000-0000-4000-8000-000000000001";
const NORTHSIDE = "10000000-0000-4000-8000-000000000001";
const EASTSIDE = "10000000-0000-4000-8000-000000000002";
const VISIT = "60000000-0000-4000-8000-000000000001";
const TOKEN = "owner-access-token-0123456789";
const SERVER_KEY = "server-key-0123456789-0123456789-0123";

const NORTHSIDE_BUSINESS = {
  id: NORTHSIDE,
  name: "Northside Plumbing",
  shortName: "Northside",
  takingRequests: true,
  prices: [{ id: VISIT, label: "Visit", amount: 45, from: false }],
  acceptWindowMin: { urgent: 5, other: 30 },
};

function setup(respond: (call: FakeCall) => FakeReply) {
  const owner = fakeSupabase(respond);
  const deps: V1Deps = {
    authenticate: async (token) => (token === TOKEN ? { userId: MARIO, db: owner.client } : null),
    serviceDb: fakeSupabase(() => ({ body: [] })).client,
    serverKey: SERVER_KEY,
  };
  const { app } = createApp({ v1: deps });
  const call = (method: string, path: string, body?: unknown) =>
    app.request(`/v1/owner${path}`, {
      method,
      headers: { authorization: `Bearer ${TOKEN}`, "content-type": "application/json" },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  return { call, calls: owner.calls };
}

function answersWithBusiness(call: FakeCall): FakeReply {
  return call.path.startsWith("/rest/v1/rpc/owner_") ? { body: NORTHSIDE_BUSINESS } : { status: 500, body: {} };
}

async function dataOf(res: Response): Promise<unknown> {
  return ((await res.json()) as { data: unknown }).data;
}

describe("GET /v1/owner/business", () => {
  it("reads the caller's business through owner_business", async () => {
    const { call, calls } = setup(answersWithBusiness);

    const res = await call("GET", "/business");

    assert.equal(res.status, 200);
    assert.deepEqual(await dataOf(res), NORTHSIDE_BUSINESS);
    assert.equal(calls[0]?.path, "/rest/v1/rpc/owner_business");
    assert.equal(calls.length, 1);
  });

  it("answers 404 when the account has no business", async () => {
    const { call } = setup(() => ({ body: null }));

    const res = await call("GET", "/business");

    assert.equal(res.status, 404);
    assert.deepEqual(await res.json(), { success: false, error: { code: "not_found", message: "No business on this account." } });
  });
});

describe("PATCH /v1/owner/business", () => {
  it("switches taking requests and sends only the fields given", async () => {
    const { call, calls } = setup(answersWithBusiness);

    const res = await call("PATCH", "/business", { takingRequests: false });

    assert.equal(res.status, 200);
    assert.deepEqual(await dataOf(res), NORTHSIDE_BUSINESS);
    assert.equal(calls[0]?.path, "/rest/v1/rpc/owner_update_business");
    assert.deepEqual(calls[0]?.body, { p_taking_requests: false });
  });

  it("edits the profile fields", async () => {
    const { call, calls } = setup(answersWithBusiness);

    await call("PATCH", "/business", { name: "Northside Plumbing Co", shortName: "North", website: "", nightJobs: true });

    assert.deepEqual(calls[0]?.body, {
      p_name: "Northside Plumbing Co",
      p_short_name: "North",
      p_website: "",
      p_night_jobs: true,
    });
  });

  it("refuses a business id from the client before touching the database", async () => {
    const { call, calls } = setup(answersWithBusiness);

    const res = await call("PATCH", "/business", { takingRequests: false, businessId: EASTSIDE });

    assert.equal(res.status, 400);
    assert.equal(calls.length, 0);
  });

  it("refuses an empty change and a website that is not http(s)", async () => {
    const { call, calls } = setup(answersWithBusiness);

    assert.equal((await call("PATCH", "/business", {})).status, 400);
    assert.equal((await call("PATCH", "/business", { website: "ftp://northside.example" })).status, 400);
    assert.equal(calls.length, 0);
  });

  it("answers 403 when staff try to change the business", async () => {
    const { call } = setup(() => pgError("42501", "only the business owner can change it", 403));

    const res = await call("PATCH", "/business", { takingRequests: false });

    assert.equal(res.status, 403);
    assert.equal(((await res.json()) as { error: { code: string } }).error.code, "forbidden");
  });
});

describe("POST /v1/owner/business", () => {
  it("creates or updates the caller's business with the onboarding profile", async () => {
    const { call, calls } = setup(answersWithBusiness);

    const res = await call("POST", "/business", {
      name: "Northside Plumbing",
      category: "plumbing",
      website: "https://northside.example",
      ownerName: "Mario R.",
    });

    assert.equal(res.status, 200);
    assert.deepEqual(await dataOf(res), NORTHSIDE_BUSINESS);
    assert.equal(calls[0]?.path, "/rest/v1/rpc/owner_create_business");
    assert.deepEqual(calls[0]?.body, {
      p_name: "Northside Plumbing",
      p_category: "plumbing",
      p_website: "https://northside.example",
      p_owner_name: "Mario R.",
    });
    assert.equal(calls.length, 1);
  });

  it("stores the category as typed on screen in its key form and sends no absent field", async () => {
    const { call, calls } = setup(answersWithBusiness);

    await call("POST", "/business", { name: "Eastside Heat", category: " Water Heaters " });

    assert.deepEqual(calls[0]?.body, { p_name: "Eastside Heat", p_category: "water_heaters" });
  });

  it("stores a website typed with a capitalized scheme in its lowercase form", async () => {
    const { call, calls } = setup(answersWithBusiness);

    const res = await call("POST", "/business", { name: "Sur", category: "plumbing", website: "Http://Sur.example" });

    assert.equal(res.status, 200);
    assert.equal((calls[0]?.body as { p_website: string }).p_website, "http://Sur.example");
  });

  it("stores an accented or punctuated category in its key form, as owners type it", async () => {
    for (const [typed, key] of [["Plomería", "plomeria"], ["Heating & Cooling", "heating_cooling"], ["A/C - Repair", "a_c_repair"]]) {
      const { call, calls } = setup(answersWithBusiness);

      await call("POST", "/business", { name: "Sur", category: typed });

      assert.equal((calls[0]?.body as { p_category: string }).p_category, key);
    }
  });

  it("refuses a tenant id, a category outside a-z and a website that is not http(s)", async () => {
    const { call, calls } = setup(answersWithBusiness);

    assert.equal((await call("POST", "/business", { name: "Eastside", category: "plumbing", businessId: EASTSIDE })).status, 400);
    assert.equal((await call("POST", "/business", { name: "Plomería Sur", category: "& 1" })).status, 400);
    assert.equal((await call("POST", "/business", { name: "Eastside", category: "plumbing", website: "ftp://e.example" })).status, 400);
    assert.equal((await call("POST", "/business", { category: "plumbing" })).status, 400);
    assert.equal(calls.length, 0);
  });

  it("answers 403 when a staff member runs onboarding", async () => {
    const { call } = setup(() => pgError("42501", "only the business owner can change it", 403));

    const res = await call("POST", "/business", { name: "Takeover", category: "plumbing" });

    assert.equal(res.status, 403);
    assert.equal(((await res.json()) as { error: { code: string } }).error.code, "forbidden");
  });
});

describe("PUT /v1/owner/business/prices", () => {
  it("replaces the price list through owner_save_prices", async () => {
    const { call, calls } = setup(answersWithBusiness);
    const prices = [
      { id: VISIT, label: "Visit", amount: 50 },
      { id: "p-added-1", label: "Unclog a drain", amount: 80 },
    ];

    const res = await call("PUT", "/business/prices", { prices });

    assert.equal(res.status, 200);
    assert.deepEqual(await dataOf(res), NORTHSIDE_BUSINESS);
    assert.equal(calls[0]?.path, "/rest/v1/rpc/owner_save_prices");
    assert.deepEqual(calls[0]?.body, { p_prices: prices });
  });

  it("refuses the same price id twice, so one save cannot write a price two ways", async () => {
    const { call, calls } = setup(answersWithBusiness);

    const res = await call("PUT", "/business/prices", {
      prices: [{ id: VISIT, label: "Visit", amount: 45 }, { id: VISIT, label: "Visit", amount: 50 }],
    });

    assert.equal(res.status, 400);
    assert.equal(calls.length, 0);
  });

  for (const amount of [0, -5, 4.5, 2_147_483_648]) {
    it(`refuses a price of ${amount}`, async () => {
      const { call, calls } = setup(answersWithBusiness);

      const res = await call("PUT", "/business/prices", { prices: [{ label: "Visit", amount }] });

      assert.equal(res.status, 400);
      assert.equal(calls.length, 0);
    });
  }
});

describe("PUT /v1/owner/business/hours", () => {
  it("replaces the opening hours through owner_save_hours", async () => {
    const { call, calls } = setup(answersWithBusiness);
    const hours = [{ weekday: 1, opens: "08:00", closes: "18:00" }];

    const res = await call("PUT", "/business/hours", { hours });

    assert.equal(res.status, 200);
    assert.equal(calls[0]?.path, "/rest/v1/rpc/owner_save_hours");
    assert.deepEqual(calls[0]?.body, { p_hours: hours });
  });

  it("refuses a weekday or time out of range", async () => {
    const { call, calls } = setup(answersWithBusiness);

    assert.equal((await call("PUT", "/business/hours", { hours: [{ weekday: 7, opens: "08:00", closes: "18:00" }] })).status, 400);
    assert.equal((await call("PUT", "/business/hours", { hours: [{ weekday: 1, opens: "8am", closes: "18:00" }] })).status, 400);
    assert.equal(calls.length, 0);
  });
});

describe("PUT /v1/owner/business/area", () => {
  it("replaces the service area through owner_save_area", async () => {
    const { call, calls } = setup(answersWithBusiness);

    const res = await call("PUT", "/business/area", { lat: 21.17, lng: -86.85, radiusKm: 8 });

    assert.equal(res.status, 200);
    assert.equal(calls[0]?.path, "/rest/v1/rpc/owner_save_area");
    assert.deepEqual(calls[0]?.body, { p_lat: 21.17, p_lng: -86.85, p_radius_km: 8 });
  });

  it("refuses a radius over 200 km", async () => {
    const { call, calls } = setup(answersWithBusiness);

    assert.equal((await call("PUT", "/business/area", { lat: 21.17, lng: -86.85, radiusKm: 201 })).status, 400);
    assert.equal(calls.length, 0);
  });
});

describe("GET /v1/owner/me", () => {
  it("still lists the businesses with takingRequests, oldest membership first", async () => {
    const { call, calls } = setup((c) => {
      if (c.path === "/rest/v1/tenant_users") {
        return { body: [{ tenant_id: NORTHSIDE, role: "owner", display_name: "Mario R." }] };
      }
      return {
        body: [{ id: NORTHSIDE, name: "Northside Plumbing", short_name: "Northside", category: "plumbing", accepts_now: true }],
      };
    });

    const res = await call("GET", "/me");

    assert.equal(res.status, 200);
    assert.deepEqual(await dataOf(res), {
      userId: MARIO,
      businesses: [{
        id: NORTHSIDE,
        name: "Northside Plumbing",
        shortName: "Northside",
        category: "plumbing",
        takingRequests: true,
        role: "owner",
        displayName: "Mario R.",
      }],
    });
    assert.equal(calls[0]?.query.get("order"), "created_at.asc,tenant_id.asc");
  });
});
