// Spec: odd/tasks/owner-business-live.md S2: the Requests "Taking requests"
// switch reads tenants.accepts_now from GET /v1/owner/me and writes it with
// PATCH /v1/owner/business; the demo shares the Settings switch.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createOwnerApi } from "../../../shared/infra/ownerApi.ts";
import { createBusinessService, createFakeBusinessClient } from "../../business/services/businessService.ts";
import { createDemoTakingRequestsClient, createLiveTakingRequestsClient } from "./takingRequestsService.ts";

type Call = { method: string; url: string; body: unknown };

const API_URL = "https://api.example";

function liveClient(data: unknown) {
  const calls: Call[] = [];
  const fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ method: String(init?.method), url: String(url), body: init?.body ? JSON.parse(String(init.body)) : undefined });
    return Response.json({ success: true, data });
  }) as typeof globalThis.fetch;
  return { client: createLiveTakingRequestsClient(createOwnerApi({ apiUrl: API_URL, getAccessToken: async () => "t", fetch })), calls };
}

describe("live taking requests", () => {
  it("reads the first business of GET /me", async () => {
    const { client, calls } = liveClient({ userId: "u1", businesses: [{ id: "b1", takingRequests: false }, { id: "b2", takingRequests: true }] });

    assert.equal(await client.load(), false);
    assert.deepEqual(calls, [{ method: "GET", url: `${API_URL}/v1/owner/me`, body: undefined }]);
  });

  it("reads not taking requests for an account without a business", async () => {
    assert.equal(await liveClient({ userId: "u1", businesses: [] }).client.load(), false);
  });

  it("patches the business and returns what the API saved", async () => {
    const { client, calls } = liveClient({ id: "b1", takingRequests: true });

    assert.equal(await client.store(true), true);
    assert.deepEqual(calls, [{ method: "PATCH", url: `${API_URL}/v1/owner/business`, body: { takingRequests: true } }]);
  });
});

describe("demo taking requests", () => {
  it("shares the switch with the business settings", async () => {
    const business = createBusinessService(createFakeBusinessClient());
    const client = createDemoTakingRequestsClient(business);

    assert.equal(await client.load(), true);
    assert.equal(await client.store(false), false);
    assert.equal((await business.getSettings()).takingRequests, false);
    assert.equal((await business.getSettings()).urgentRequests, true, "the other switches stay");
  });
});
