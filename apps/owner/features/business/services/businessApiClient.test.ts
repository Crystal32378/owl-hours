// Spec: odd/tasks/owner-business-live.md S1. In live mode the business
// service reads GET /v1/owner/business and writes PUT /business/prices and
// PATCH /business, with fetch injected through createOwnerApi; nothing comes
// from shared/data/mock.ts.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createOwnerApi } from "../../../shared/infra/ownerApi.ts";
import { createBusinessApiClient } from "./businessApiClient.ts";
import { createBusinessService } from "./businessService.ts";

type Call = { method: string; url: string; body: unknown };

const API_URL = "https://api.example";

const northside = {
  id: "10000000-0000-4000-8000-000000000001",
  name: "Northside Plumbing",
  shortName: "Northside",
  category: "plumbing",
  logoUrl: null,
  website: "https://northside.example",
  rating: { value: 4.9, count: 128 },
  technicians: 1,
  prices: [
    { id: "pr-visit", label: "Visit", amount: 45, from: false },
    { id: "pr-leak", label: "Leak repair", amount: 60, from: true },
  ],
  fees: [
    { id: "pr-night", label: "Night fee", amount: 25, window: "10 PM-7 AM", atNight: true },
    { id: "pr-parts", label: "Parts", amount: "at_cost", atNight: false },
  ],
  hours: [1, 2, 3, 4, 5, 6].map((weekday) => ({ weekday, opens: "08:00", closes: "18:00" })),
  nightJobs: true,
  area: { lat: 21.1727, lng: -86.8515, radiusKm: 8 },
  hasLocation: true,
  takingRequests: true,
  acceptWindowMin: { urgent: 5, other: 30 },
  linkedAccounts: [{ kind: "facebook_page", name: "Northside Plumbing (test Page)" }],
};

function liveService(answer: (call: Call) => { status: number; body: unknown } = () => ok(northside)) {
  const calls: Call[] = [];
  const fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    const call = { method: String(init?.method), url: String(url), body: init?.body ? JSON.parse(String(init.body)) : undefined };
    calls.push(call);
    const reply = answer(call);
    return Response.json(reply.body, { status: reply.status });
  }) as typeof globalThis.fetch;
  const api = createOwnerApi({ apiUrl: API_URL, getAccessToken: async () => "token", fetch });
  return { service: createBusinessService(createBusinessApiClient(api)), calls };
}

function ok(data: unknown) {
  return { status: 200, body: { success: true, data } };
}

describe("live businessService.getBusiness", () => {
  it("maps GET /business to the business the screens show", async () => {
    const { service, calls } = liveService();

    const business = await service.getBusiness();

    assert.deepEqual(calls, [{ method: "GET", url: `${API_URL}/v1/owner/business`, body: undefined }]);
    assert.deepEqual(business, {
      id: northside.id,
      name: "Northside Plumbing",
      category: "plumbing",
      logoUrl: "",
      website: "https://northside.example",
      rating: { value: 4.9, count: 128 },
      technicians: 1,
      prices: northside.prices,
      fees: northside.fees,
      hours: { summary: "Mon–Sat, 8 AM–6 PM", nightUrgent: true },
      area: { center: { lat: 21.1727, lng: -86.8515 }, radiusKm: 8 },
      takingRequests: true,
      acceptWindowMin: { urgent: 5, other: 30 },
    });
  });

  it("labels the service area with the short name and imports no service count", async () => {
    assert.deepEqual(await liveService().service.getRowExtras(), { areaLabel: "Northside", importedServices: null, hasLocation: true });
  });

  // Spec: odd/tasks/owner-area-map-fees-dark.md S1: the Business tab map shows the
  // overview while the business still sits at the (0, 0) placeholder.
  it("S1 reads that a new business has no real location yet", async () => {
    const { service } = liveService(() => ok({ ...northside, area: null, hasLocation: false }));

    assert.equal((await service.getRowExtras()).hasLocation, false);
  });

  it("rejects when the API fails, so the screen draws its error state", async () => {
    const { service } = liveService(() => ({ status: 500, body: { success: false, error: { code: "internal", message: "x" } } }));

    await assert.rejects(service.getBusiness());
  });
});

describe("live businessService.savePrices", () => {
  it("puts the edited list and returns the saved business", async () => {
    const saved = { ...northside, prices: [{ id: "pr-visit", label: "Visit", amount: 50, from: false }] };
    const { service, calls } = liveService(() => ok(saved));
    const edited = [{ id: "pr-visit", label: "Visit", amount: 50, from: false }];

    const business = await service.savePrices(edited);

    assert.deepEqual(calls[0], {
      method: "PUT",
      url: `${API_URL}/v1/owner/business/prices`,
      body: { prices: [{ id: "pr-visit", label: "Visit", amount: 50 }] },
    });
    assert.deepEqual(business?.prices, edited);
  });

  it("sends nothing for an invalid price", async () => {
    const { service, calls } = liveService();

    assert.equal(await service.savePrices([{ id: "pr-visit", label: "Visit", amount: 0, from: false }]), null);
    assert.equal(calls.length, 0);
  });
});

describe("live businessService.saveFees", () => {
  it("puts the edited fees and returns the saved business", async () => {
    const savedFees = [{ id: "pr-night", label: "Night", amount: 30, window: "10 PM-7 AM", atNight: true }];
    const { service, calls } = liveService(() => ok({ ...northside, fees: savedFees }));
    const edited = [
      { id: "pr-night", label: "Night", amount: 30, atNight: true },
      { id: "f-new-1", label: "Weekend", amount: 15, atNight: false },
    ];

    const business = await service.saveFees(edited);

    assert.deepEqual(calls, [{ method: "PUT", url: `${API_URL}/v1/owner/business/fees`, body: { fees: edited } }]);
    assert.deepEqual(business?.fees, savedFees);
  });

  it("sends nothing for an incomplete fee", async () => {
    const { service, calls } = liveService();

    assert.equal(await service.saveFees([{ id: "f-new-1", label: "Weekend", amount: 0, atNight: false }]), null);
    assert.equal(calls.length, 0);
  });
});

describe("live businessService settings", () => {
  it("reads only the switch the database stores", async () => {
    assert.deepEqual(await liveService().service.getSettings(), { takingRequests: true });
  });

  it("patches taking requests and returns what the API saved", async () => {
    const { service, calls } = liveService(() => ok({ ...northside, takingRequests: false }));

    assert.deepEqual(await service.saveSettings({ takingRequests: false }), { takingRequests: false });
    assert.deepEqual(calls[0], { method: "PATCH", url: `${API_URL}/v1/owner/business`, body: { takingRequests: false } });
  });

  it("lists the linked accounts as connected", async () => {
    assert.deepEqual(await liveService().service.getAccounts(), [
      { kind: "facebook_page", name: "Northside Plumbing (test Page)", status: "connected" },
    ]);
  });
});

describe("live businessService hours", () => {
  it("reads the shifts from GET /business", async () => {
    const { service, calls } = liveService();

    assert.deepEqual(await service.getHours(), northside.hours);
    assert.deepEqual(calls.map(({ method, url }) => ({ method, url })), [{ method: "GET", url: `${API_URL}/v1/owner/business` }]);
  });

  it("saves through PUT /business/hours and answers the stored shifts", async () => {
    const stored = [{ weekday: 5, opens: "22:00", closes: "04:00" }];
    const { service, calls } = liveService(() => ok({ ...northside, hours: stored }));

    assert.deepEqual(await service.saveHours(stored), stored);
    assert.deepEqual(calls, [{ method: "PUT", url: `${API_URL}/v1/owner/business/hours`, body: { hours: stored } }]);
  });
});
