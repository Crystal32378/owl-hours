// The device zone is fixed so the mapped local timestamps are exact (Bogotá: UTC-5, no daylight saving).
process.env.TZ = "America/Bogota";

// Spec: odd/tasks/live-owner-core.md T2 (S2). The live offers client reads and answers
// offers through the owner API: GET /offers?status=…, POST /offers/:id/accept and
// POST /offers/:id/decline {reason}, with fetch injected through createOwnerApi.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createOwnerApi } from "../../../shared/infra/ownerApi.ts";
import { createOffersApiClient } from "./offersApiClient.ts";
import { createOffersService } from "./offersService.ts";

type Call = { method: string; url: string; body: unknown };
type Reply = { status: number; body: unknown };

const API_URL = "https://api.example";

const anaOffer = {
  id: "off_ana",
  conversationId: "conv_ana",
  businessId: "biz_1",
  status: "offered",
  urgent: true,
  distanceKm: 1.2,
  suggestedQuote: { min: 130, max: 160 },
  offeredAt: "2026-10-28T05:05:00.000Z",
  expiresAt: "2026-10-28T05:10:00.000Z",
  declineReason: null,
  title: "Leaking toilet, water reaching the hallway",
  zukkiSummary: "Valve closed, no cables near the water.",
  customerName: "Ana L.",
  approxLocation: "Northside",
  customerQuote: "It keeps running",
  media: [
    { id: "m1", kind: "video", role: "evidence", durationMs: 14_500, url: "https://cdn/v.mp4", thumbUrl: "https://cdn/v.jpg" },
    { id: "m2", kind: "image", role: "marked_frame", durationMs: null, url: "https://cdn/p.jpg", thumbUrl: null },
  ],
};

const carlosOffer = {
  ...anaOffer,
  id: "off_carlos",
  conversationId: "conv_carlos",
  status: "accepted",
  urgent: false,
  suggestedQuote: null,
  offeredAt: "2026-10-28T02:40:00.000Z",
  customerQuote: null,
  media: [],
};

function fakeApi(replyTo: (call: Call) => Reply) {
  const calls: Call[] = [];
  const fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    const call = { method: String(init?.method), url: String(url), body: init?.body ? JSON.parse(String(init.body)) : undefined };
    calls.push(call);
    const reply = replyTo(call);
    return Response.json(reply.body, { status: reply.status });
  }) as typeof globalThis.fetch;
  const api = createOwnerApi({ apiUrl: API_URL, getAccessToken: async () => "token", fetch });
  return { calls, service: createOffersService(createOffersApiClient(api)) };
}

function ok(data: unknown): Reply {
  return { status: 200, body: { success: true, data } };
}

function offersByStatus(call: Call): Reply {
  const status = new URL(call.url).searchParams.get("status");
  if (status === "offered") return ok([anaOffer]);
  if (status === "accepted") return ok([carlosOffer]);
  return ok([]);
}

// Like the backend: once answered, the offer leaves the "offered" list.
function offeredThen(answer: (call: Call) => Reply) {
  let isAnswered = false;
  return (call: Call) => {
    if (call.method === "GET") return isAnswered ? ok([]) : offersByStatus(call);
    isAnswered = true;
    return answer(call);
  };
}

describe("offersApiClient.listOffers", () => {
  it("reads every owner-visible status from GET /offers?status=…", async () => {
    const { calls, service } = fakeApi(offersByStatus);

    await service.listOffers();

    const urls = calls.map((call) => `${call.method} ${call.url}`).sort();
    assert.deepEqual(urls, [
      `GET ${API_URL}/v1/owner/offers?status=accepted`,
      `GET ${API_URL}/v1/owner/offers?status=declined`,
      `GET ${API_URL}/v1/owner/offers?status=expired`,
      `GET ${API_URL}/v1/owner/offers?status=offered`,
    ]);
  });

  it("puts media with a picture first, so a live video without a thumbnail does not hide the marked photo", async () => {
    const video = { id: "m1", kind: "video", role: "evidence", durationMs: 6000, url: "https://cdn/v.mp4", thumbUrl: null };
    const photo = { id: "m2", kind: "image", role: "marked_frame", durationMs: null, url: "https://cdn/p.jpg", thumbUrl: null };
    const { service } = fakeApi(({ url }) => ({
      status: 200,
      body: { data: url.endsWith("status=offered") ? [{ ...anaOffer, media: [video, photo] }] : [] },
    }));

    const [offer] = await service.listOffers();

    assert.deepEqual(offer?.media, [
      { kind: "photo", url: "https://cdn/p.jpg", thumbUrl: "https://cdn/p.jpg" },
      { kind: "video", url: "https://cdn/v.mp4", thumbUrl: "", durationS: 6 },
    ]);
  });

  it("returns the offers newest first, mapped to the app's offer shape", async () => {
    const { service } = fakeApi(offersByStatus);

    const offers = await service.listOffers();

    assert.deepEqual(offers, [
      {
        id: "off_ana",
        customerName: "Ana L.",
        title: "Leaking toilet, water reaching the hallway",
        urgent: true,
        distanceKm: 1.2,
        approxLocation: "Northside",
        media: [
          { kind: "video", url: "https://cdn/v.mp4", thumbUrl: "https://cdn/v.jpg", durationS: 14 },
          { kind: "photo", url: "https://cdn/p.jpg", thumbUrl: "https://cdn/p.jpg" },
        ],
        customerQuote: "It keeps running",
        zukkiSummary: "Valve closed, no cables near the water.",
        suggestedQuote: { min: 130, max: 160 },
        offeredAt: "2026-10-28T00:05:00-05:00",
        expiresAt: "2026-10-28T00:10:00-05:00",
        status: "offered",
      },
      {
        id: "off_carlos",
        customerName: "Ana L.",
        title: "Leaking toilet, water reaching the hallway",
        urgent: false,
        distanceKm: 1.2,
        approxLocation: "Northside",
        media: [],
        zukkiSummary: "Valve closed, no cables near the water.",
        suggestedQuote: null,
        offeredAt: "2026-10-27T21:40:00-05:00",
        expiresAt: "2026-10-28T00:10:00-05:00",
        status: "accepted",
      },
    ]);
  });
});

// Spec: odd/tasks/owner-requests-data.md S1, S2. A request picked from the category list has
// no title yet, and a customer who never shared a location has no distance.
describe("offersApiClient fills what the API leaves out", () => {
  async function onlyOffer(row: Record<string, unknown>) {
    const { service } = fakeApi((call) => (new URL(call.url).searchParams.get("status") === "offered" ? ok([row]) : ok([])));
    const [offer] = await service.listOffers();
    return offer;
  }

  it("names a request without a title by its category", async () => {
    const offer = await onlyOffer({ ...anaOffer, title: null, category: "plumbing" });

    assert.equal(offer?.title, "Plumbing request");
  });

  it("names a request with neither title nor category a service request", async () => {
    const offer = await onlyOffer({ ...anaOffer, title: null, category: null });

    assert.equal(offer?.title, "Service request");
  });

  it("keeps the title the customer's description gave", async () => {
    const offer = await onlyOffer({ ...anaOffer, category: "plumbing" });

    assert.equal(offer?.title, "Leaking toilet, water reaching the hallway");
  });

  it("keeps an unknown distance unknown instead of 0", async () => {
    const offer = await onlyOffer({ ...anaOffer, distanceKm: null });

    assert.equal(offer?.distanceKm, null);
  });
});

describe("offersApiClient answers", () => {
  it("accept posts POST /offers/:id/accept and returns the accepted offer", async () => {
    const { calls, service } = fakeApi(offeredThen(() => ok({ id: "off_ana", status: "accepted" })));

    const accepted = await service.accept("off_ana");

    const post = calls.find((call) => call.method === "POST");
    assert.equal(post?.url, `${API_URL}/v1/owner/offers/off_ana/accept`);
    assert.equal(post?.body, undefined);
    assert.equal(accepted?.status, "accepted");
  });

  it("encodes the offer id in the answer path", async () => {
    const odd = { ...anaOffer, id: "off/ana" };
    const { calls, service } = fakeApi((call) => (call.method === "GET" ? ok([odd]) : ok({ id: "off/ana", status: "accepted" })));

    await service.accept("off/ana");

    assert.equal(calls.find((call) => call.method === "POST")?.url, `${API_URL}/v1/owner/offers/off%2Fana/accept`);
  });

  it("after accept, the offer's conversationId is the chat to open", async () => {
    const { service } = fakeApi(offeredThen(() => ok({ id: "off_ana", status: "accepted" })));

    await service.accept("off_ana");

    assert.equal(await service.findChat("off_ana"), "conv_ana");
  });

  it("decline posts the chosen reason to POST /offers/:id/decline", async () => {
    const { calls, service } = fakeApi(offeredThen(() => ok({ id: "off_ana", status: "declined" })));

    const declined = await service.decline("off_ana", "too_far");

    const post = calls.find((call) => call.method === "POST");
    assert.equal(post?.url, `${API_URL}/v1/owner/offers/off_ana/decline`);
    assert.deepEqual(post?.body, { reason: "too_far" });
    assert.equal(declined?.declineReason, "too_far");
  });

  it("a 409 offer_expired on accept answers null and leaves the offer expired", async () => {
    const expired: Reply = { status: 409, body: { success: false, error: { code: "offer_expired", message: "This request expired before you accepted it." } } };
    let isExpiredOnServer = false;
    const { service } = fakeApi((call) => {
      if (call.method === "POST") {
        isExpiredOnServer = true;
        return expired;
      }
      return isExpiredOnServer ? ok([]) : offersByStatus(call);
    });

    const accepted = await service.accept("off_ana");

    assert.equal(accepted, null);
    assert.equal((await service.getOffer("off_ana"))?.status, "expired");
    assert.equal(await service.findChat("off_ana"), null);
  });

  it("any other failure on accept still rejects", async () => {
    const { service } = fakeApi(offeredThen(() => ({ status: 500, body: { success: false, error: { code: "boom", message: "Boom" } } })));

    await assert.rejects(service.accept("off_ana"), { status: 500, code: "boom" });
  });

  it("getOffer reads an offer answered elsewhere with its new status, not the cached offered one", async () => {
    let isAnsweredElsewhere = false;
    const { service } = fakeApi((call) => {
      if (!isAnsweredElsewhere) return offersByStatus(call);
      const status = new URL(call.url).searchParams.get("status");
      return ok(status === "accepted" ? [{ ...anaOffer, status: "accepted" }] : []);
    });
    await service.getOffer("off_ana");
    isAnsweredElsewhere = true;

    assert.equal((await service.getOffer("off_ana"))?.status, "accepted");
  });

  it("getOffer finds an offered request by id, and null for an unknown id", async () => {
    const { service } = fakeApi(offersByStatus);

    assert.equal((await service.getOffer("off_ana"))?.title, "Leaking toilet, water reaching the hallway");
    assert.equal(await service.getOffer("off_nobody"), null);
  });
});
