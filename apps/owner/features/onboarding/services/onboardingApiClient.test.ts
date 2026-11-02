// Spec: odd/tasks/owner-onboarding-live.md, T1, S1-S2. In live mode the
// onboarding steps save to the owner API (fetch injected through
// createOwnerApi): the business step creates the business with POST /business,
// prices and area go through PUT /business/prices and /business/area, the
// night switch through PATCH /business, and fees and the hours summary are
// read from GET /business. Website import offers nothing: apps/api has no importer.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { business as mockBusiness } from "../../../shared/data/mock.ts";
import { createOwnerApi } from "../../../shared/infra/ownerApi.ts";
import {
  createFakeOnboardingClient,
  createOnboardingService,
  demoOnboardingService,
  onboardingServiceFor,
  type CodeAuth,
} from "./onboardingService.ts";
import { createApiOnboardingClient } from "./onboardingApiClient.ts";

type Call = { method: string; url: string; body: unknown };
type Reply = { status: number; body: unknown };

const API_URL = "https://api.example";
const BUSINESS_URL = `${API_URL}/v1/owner/business`;

const eastside = {
  id: "10000000-0000-4000-8000-000000000002",
  name: "Eastside Heat",
  shortName: "Eastside",
  category: "water_heaters",
  logoUrl: null,
  website: "https://eastside.example",
  rating: { value: null, count: 0 },
  technicians: 0,
  prices: [{ id: "p-visit", label: "Visit", amount: 40, from: false }],
  fees: [{ id: "p-night", label: "Night fee", amount: 30, window: "9 PM-6 AM" }],
  hours: [1, 2, 3, 4, 5].map((weekday) => ({ weekday, opens: "09:00", closes: "17:00" })),
  nightJobs: false,
  area: { lat: 21.16, lng: -86.85, radiusKm: 12 },
  hasLocation: true,
  takingRequests: false,
  acceptWindowMin: { urgent: 5, other: 30 },
  linkedAccounts: [],
};

const newBusiness = { ...eastside, prices: [], fees: [], hours: [], area: null, hasLocation: false };

function ok(data: unknown): Reply {
  return { status: 200, body: { success: true, data } };
}

const NO_BUSINESS: Reply = { status: 404, body: { success: false, error: { code: "not_found", message: "No business on this account." } } };

function liveOnboarding(answer: (call: Call) => Reply = () => ok(eastside)) {
  const calls: Call[] = [];
  const fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    const call = { method: String(init?.method), url: String(url), body: init?.body ? JSON.parse(String(init.body)) : undefined };
    calls.push(call);
    const reply = answer(call);
    return Response.json(reply.body, { status: reply.status });
  }) as typeof globalThis.fetch;
  const api = createOwnerApi({ apiUrl: API_URL, getAccessToken: async () => "token", fetch });
  const service = createOnboardingService(createApiOnboardingClient(api, createFakeOnboardingClient()), {
    owner: { name: "", email: "" },
  });
  return { service, calls };
}

function writes(calls: Call[]): Call[] {
  return calls.filter((call) => call.method !== "GET");
}

describe("live onboarding business step", () => {
  it("creates the business with the profile and the sign-up name", async () => {
    const { service, calls } = liveOnboarding();

    await service.saveOwnerName("Ana Ruiz");
    await service.saveProfile({ name: "Eastside Heat", category: "Water Heaters", website: "eastside.example" });

    assert.deepEqual(writes(calls), [
      {
        method: "POST",
        url: BUSINESS_URL,
        body: { name: "Eastside Heat", category: "Water Heaters", website: "https://eastside.example", ownerName: "Ana Ruiz" },
      },
    ]);
  });

  it("sends no owner name when sign-up left none and keeps an empty website empty", async () => {
    const { service, calls } = liveOnboarding();

    await service.saveProfile({ name: "Eastside Heat", category: "plumbing", website: " " });

    assert.deepEqual(writes(calls)[0]?.body, { name: "Eastside Heat", category: "plumbing", website: "" });
  });

  it("starts from the saved business profile", async () => {
    const { service } = liveOnboarding();

    assert.deepEqual(await service.getProfile(), { name: "Eastside Heat", category: "water_heaters", website: "https://eastside.example" });
  });

  it("starts empty, not from the demo business, when the account has no business yet", async () => {
    const { service } = liveOnboarding(() => NO_BUSINESS);

    assert.deepEqual(await service.getProfile(), { name: "", category: "", website: "" });
  });

  it("offers no website import and calls nothing", async () => {
    const { service, calls } = liveOnboarding();

    assert.deepEqual(await service.importFromWebsite("eastside.example"), { services: 0, prices: [] });
    assert.deepEqual(calls, []);
  });
});

describe("live onboarding prices step", () => {
  it("reads the business prices and fees from GET /business", async () => {
    const { service } = liveOnboarding();

    assert.deepEqual(await service.getPrices(), eastside.prices);
    assert.deepEqual(await service.getFees(), [{ id: "p-night", label: "Night fee", amount: 30, window: "9 PM-6 AM" }]);
  });

  it("saves the prices through PUT /business/prices", async () => {
    const { service, calls } = liveOnboarding();

    await service.savePrices([
      { id: "p-visit", label: "Visit", amount: 45, from: false },
      { id: "new-1", label: "Descale", amount: 90, from: false },
    ]);

    assert.deepEqual(writes(calls), [
      {
        method: "PUT",
        url: `${BUSINESS_URL}/prices`,
        body: { prices: [{ id: "p-visit", label: "Visit", amount: 45 }, { id: "new-1", label: "Descale", amount: 90 }] },
      },
    ]);
  });

  it("a new business has no prices and no fees", async () => {
    const { service } = liveOnboarding(() => ok(newBusiness));

    assert.deepEqual(await service.getPrices(), []);
    assert.deepEqual(await service.getFees(), []);
  });
});

describe("live onboarding area step", () => {
  it("reads the radius, night switch and hours summary from GET /business", async () => {
    const { service } = liveOnboarding();

    assert.deepEqual(await service.getArea(), { radiusKm: 12 });
    assert.equal(await service.getNightUrgent(), false);
    assert.equal(await service.getHoursSummary(), "Mon–Fri, 9 AM–5 PM");
  });

  it("saves the radius around the stored area centre", async () => {
    const { service, calls } = liveOnboarding();

    await service.saveArea({ radiusKm: 7 });

    assert.deepEqual(writes(calls), [{ method: "PUT", url: `${BUSINESS_URL}/area`, body: { lat: 21.16, lng: -86.85, radiusKm: 7 } }]);
  });

  it("a new business saves its first area at the placeholder point", async () => {
    const { service, calls } = liveOnboarding(() => ok(newBusiness));

    await service.saveArea({ radiusKm: 5 });

    assert.deepEqual(writes(calls), [{ method: "PUT", url: `${BUSINESS_URL}/area`, body: { lat: 0, lng: 0, radiusKm: 5 } }]);
  });

  it("saves the night switch through PATCH /business", async () => {
    const { service, calls } = liveOnboarding();

    await service.setNightUrgent(true);

    assert.deepEqual(writes(calls), [{ method: "PATCH", url: BUSINESS_URL, body: { nightJobs: true } }]);
  });
});

// Spec: odd/tasks/owner-device-location.md, T2, S3-S4. GET /business says whether the
// business still sits at the (0, 0) placeholder; the device point is saved as the area centre.
describe("live onboarding business location", () => {
  it("S3 a new business at the placeholder point still needs its location", async () => {
    const { service } = liveOnboarding(() => ok(newBusiness));

    assert.equal(await service.getLocationStatus(), "missing");
  });

  it("S3 an account without a business still needs its location", async () => {
    const { service } = liveOnboarding(() => NO_BUSINESS);

    assert.equal(await service.getLocationStatus(), "missing");
  });

  it("S4 a business with a real location has it saved", async () => {
    const { service } = liveOnboarding();

    assert.equal(await service.getLocationStatus(), "saved");
  });

  it("S3 saves the device point as the area centre with the chosen radius", async () => {
    const { service, calls } = liveOnboarding(() => ok(newBusiness));

    await service.saveLocation({ lat: 20.97, lng: -89.62 }, 9);

    assert.deepEqual(writes(calls), [{ method: "PUT", url: `${BUSINESS_URL}/area`, body: { lat: 20.97, lng: -89.62, radiusKm: 9 } }]);
  });
});

// Spec: odd/tasks/owner-area-map-fees-dark.md, T1, S1. The map centres on the saved area centre.
describe("live onboarding area map centre", () => {
  it("S1 reads the area centre from GET /business", async () => {
    const { service } = liveOnboarding();

    assert.deepEqual(await service.getCenter(), { lat: 21.16, lng: -86.85 });
  });

  it("S1 a new business without an area reads the placeholder point", async () => {
    const { service } = liveOnboarding(() => ok(newBusiness));

    assert.deepEqual(await service.getCenter(), { lat: 0, lng: 0 });
  });

  it("S1 an account without a business reads the placeholder point", async () => {
    const { service } = liveOnboarding(() => NO_BUSINESS);

    assert.deepEqual(await service.getCenter(), { lat: 0, lng: 0 });
  });

  it("S1 the demo business reads its own area centre", async () => {
    assert.deepEqual(await demoOnboardingService.getCenter(), mockBusiness.area.center);
  });
});

describe("onboardingServiceFor with the live owner API", () => {
  it("runs the steps on the API, so live shows the saved business name and radius", async () => {
    const codeAuth: CodeAuth = { sendCode: async () => true, verifyCode: async () => true };
    const fetch = (async () => Response.json({ success: true, data: eastside })) as typeof globalThis.fetch;
    const api = createOwnerApi({ apiUrl: API_URL, getAccessToken: async () => "token", fetch });
    const service = onboardingServiceFor(codeAuth, api);

    assert.equal((await service.getProfile()).name, "Eastside Heat");
    assert.deepEqual(await service.getArea(), { radiusKm: 12 });
  });
});

describe("demo onboarding stays on the demo business", () => {
  it("imports the demo prices and reads the demo fees and hours", async () => {
    assert.deepEqual(await demoOnboardingService.importFromWebsite("northside-plumbing.example"), {
      services: 12,
      prices: structuredClone(mockBusiness.prices),
    });
    assert.deepEqual(await demoOnboardingService.getFees(), structuredClone(mockBusiness.fees));
    assert.equal(await demoOnboardingService.getHoursSummary(), mockBusiness.hours.summary);
  });

  it("S3 keeps the demo business's preset location, so the area step never asks", async () => {
    assert.equal(await demoOnboardingService.getLocationStatus(), "preset");
  });
});
