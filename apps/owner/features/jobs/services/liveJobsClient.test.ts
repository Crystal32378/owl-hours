// The live JobsClient over /v1/owner/jobs (S6), driven through createOwnerApi with a fake fetch.
// The device zone is fixed so arrival instants are exact (Bogotá: UTC-5, no daylight saving).
process.env.TZ = "America/Bogota";

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createOwnerApi } from "../../../shared/infra/ownerApi.ts";
import type { Job } from "../../../shared/data/types.ts";
import { createLiveJobsClient } from "./liveJobsClient.ts";
import { createJobsService } from "./jobsService.ts";

type Call = { method: string; url: string; body: unknown };
type Route = { status: number; data?: unknown; error?: { code: string; message: string } };

const API = "https://api.example.com";
const JOB_DAY = new Date("2026-10-28T00:07:00-05:00");

function fakeApi(routes: Record<string, Route>) {
  const calls: Call[] = [];
  const fetch = (async (url: string, init: RequestInit) => {
    const method = init.method ?? "GET";
    calls.push({ method, url, body: init.body === undefined ? undefined : JSON.parse(String(init.body)) });
    const route = routes[`${method} ${url.replace(`${API}/v1/owner`, "")}`] ?? { status: 404, error: { code: "not_found", message: "Not found." } };
    const body = route.error ? { success: false, error: route.error } : { success: true, data: route.data };
    return Response.json(body, { status: route.status });
  }) as unknown as typeof globalThis.fetch;
  const api = createOwnerApi({ apiUrl: API, getAccessToken: async () => "tok", fetch });
  return { api, calls };
}

function liveClient(routes: Record<string, Route>) {
  const { api, calls } = fakeApi(routes);
  return { client: createLiveJobsClient(api, { now: () => JOB_DAY }), calls };
}

// owner_jobs JSON (supabase/migrations/20261028121212_api_layer.sql), timestamps in UTC like Postgres sends them.
const approvedJob = {
  id: "j1",
  conversationId: "c1",
  businessId: "b1",
  title: "Leaking toilet",
  state: "customer_approved",
  customerName: "Ana L.",
  technicianId: "t1",
  technician: "Mario R.",
  arrivalWindow: "12:55–1:25 AM",
  currency: "USD",
  total: { min: 130, max: 160 },
  finalTotal: null,
  location: { address: "128 Palm Ave, apt 4", latitude: 25.7, longitude: -80.2 },
  quote: {
    id: "q1",
    status: "approved",
    lines: [
      { label: "Visit", min: 45, max: 45 },
      { label: "Fill valve repair", min: 60, max: 90 },
    ],
    total: { min: 105, max: 135 },
    arrivalFrom: "2026-10-28T05:55:00+00:00",
    arrivalTo: "2026-10-28T06:25:00+00:00",
    note: "Excludes floor damage",
    sentAt: "2026-10-28T05:06:00+00:00",
  },
  shareConsent: "not_asked",
  timeline: [
    { at: "2026-10-28T05:05:00+00:00", actor: "owner", from: null, to: "proposed" },
    { at: "2026-10-28T05:06:00+00:00", actor: "owner", from: "proposed", to: "owner_confirmed" },
    { at: "2026-10-28T05:07:00+00:00", actor: "customer", from: "owner_confirmed", to: "customer_approved" },
  ],
};

const proposedJob = {
  ...approvedJob,
  id: "j2",
  conversationId: "c2",
  state: "proposed",
  customerName: "Carlos M.",
  arrivalWindow: null,
  total: null,
  location: null,
  quote: null,
  timeline: [{ at: "2026-10-28T05:05:00+00:00", actor: "owner", from: null, to: "proposed" }],
};

const expectedApprovedJob: Job = {
  id: "j1",
  conversationId: "c1",
  title: "Leaking toilet",
  customerName: "Ana L.",
  technician: "Mario R.",
  address: "128 Palm Ave, apt 4",
  approvedAt: "2026-10-28T00:07:00-05:00",
  quote: {
    lines: [
      { label: "Visit", amount: 45 },
      { label: "Fill valve repair", amount: { min: 60, max: 90 } },
    ],
    total: { min: 105, max: 135 },
    arrival: { from: "12:55 AM", to: "1:25 AM" },
    technician: "Mario R.",
    note: "Excludes floor damage",
  },
  status: "customer_approved",
  timeline: [
    { at: "2026-10-28T00:05:00-05:00", text: "You accepted the request" },
    { at: "2026-10-28T00:07:00-05:00", text: "Quote sent and approved" },
  ],
  photos: { extra: [] },
  shareConsent: "not_asked",
};

describe("live jobs client: reading", () => {
  it("lists GET /jobs mapped to the app's jobs", async () => {
    const { client, calls } = liveClient({ "GET /jobs": { status: 200, data: [approvedJob] } });

    assert.deepEqual(await client.listJobs(), [expectedApprovedJob]);
    assert.deepEqual(calls.map(({ method, url }) => `${method} ${url}`), [`GET ${API}/v1/owner/jobs`]);
  });

  it("reads an API proposed job as quoted, with a draft seeded from the job's suggested range", async () => {
    const suggested = { ...proposedJob, total: { min: 80, max: 110 } };
    const { client } = liveClient({ "GET /jobs": { status: 200, data: [suggested] } });

    const job = await client.findJobByConversationId("c2");
    assert.ok(job);
    assert.equal(job.status, "quoted");
    assert.equal(job.address, undefined);
    assert.equal(job.approvedAt, undefined);
    // now is 12:07 AM: +30 min is 12:37, the next quarter hour is 12:45, and the window lasts 60 min.
    assert.deepEqual(job.quote, {
      lines: [{ label: "Leaking toilet", amount: { min: 80, max: 110 } }],
      total: { min: 80, max: 110 },
      arrival: { from: "12:45 AM", to: "1:45 AM" },
      technician: "Mario R.",
    });
  });

  it("seeds a zero range when the job has no suggested range; the owner fills the amounts in", async () => {
    const { client } = liveClient({ "GET /jobs": { status: 200, data: [proposedJob] } });

    const job = await client.findJobByConversationId("c2");
    assert.ok(job);
    assert.deepEqual(job.quote.lines, [{ label: "Leaking toilet", amount: { min: 0, max: 0 } }]);
    assert.deepEqual(job.quote.total, { min: 0, max: 0 });
  });

  it("keeps a quarter-hour start as it is", async () => {
    const { api } = fakeApi({ "GET /jobs": { status: 200, data: [proposedJob] } });
    const client = createLiveJobsClient(api, { now: () => new Date("2026-10-28T00:15:00-05:00") });

    const job = await client.findJobByConversationId("c2");
    assert.ok(job);
    assert.deepEqual(job.quote.arrival, { from: "12:45 AM", to: "1:45 AM" });
  });

  it("keeps the final total once the job is done", async () => {
    const doneJob = { ...approvedJob, state: "done", finalTotal: 145 };
    const { client } = liveClient({ "GET /jobs": { status: 200, data: [doneJob] } });

    const [job] = await client.listJobs();
    assert.equal(job.status, "done");
    assert.equal(job.finalTotal, 145);
  });

  it("hides jobs the owner cannot act on: not yet proposed, declined or cancelled", async () => {
    const hidden = ["requested", "triaged", "declined", "cancelled"].map((state, index) => ({ ...approvedJob, id: `h${index}`, state }));
    const { client } = liveClient({ "GET /jobs": { status: 200, data: [...hidden, approvedJob] } });

    assert.deepEqual((await client.listJobs()).map((job) => job.id), ["j1"]);
  });

  it("finds one job with GET /jobs/:id, and answers null for an unknown id", async () => {
    const { client, calls } = liveClient({ "GET /jobs/j1": { status: 200, data: approvedJob } });

    assert.deepEqual(await client.findJob("j1"), expectedApprovedJob);
    assert.equal(await client.findJob("missing"), null);
    assert.deepEqual(calls.map(({ url }) => url), [`${API}/v1/owner/jobs/j1`, `${API}/v1/owner/jobs/missing`]);
  });

  it("finds a conversation's job in the list, or null", async () => {
    const { client } = liveClient({ "GET /jobs": { status: 200, data: [proposedJob, approvedJob] } });

    assert.equal((await client.findJobByConversationId("c1"))?.id, "j1");
    assert.equal(await client.findJobByConversationId("c9"), null);
  });

  it("lets other API failures through", async () => {
    const { client } = liveClient({ "GET /jobs/j1": { status: 500, error: { code: "internal", message: "Boom." } } });

    await assert.rejects(client.findJob("j1"), { code: "internal" });
  });
});

describe("live jobs client: writing", () => {
  it("sends a quoted job with POST /jobs/:id/quote, lines as min/max and arrival as ISO instants", async () => {
    const { client, calls } = liveClient({ "POST /jobs/j1/quote": { status: 201, data: { id: "q2" } } });
    const quoted: Job = {
      ...expectedApprovedJob,
      status: "quoted",
      quote: { ...expectedApprovedJob.quote, arrival: { from: "11:50 PM", to: "12:20 AM" } },
    };

    await client.saveJob(quoted);

    assert.deepEqual(calls, [
      {
        method: "POST",
        url: `${API}/v1/owner/jobs/j1/quote`,
        body: {
          lines: [
            { label: "Visit", min: 45, max: 45 },
            { label: "Fill valve repair", min: 60, max: 90 },
          ],
          arrivalFrom: "2026-10-28T23:50:00-05:00",
          arrivalTo: "2026-10-29T00:20:00-05:00",
          note: "Excludes floor damage",
        },
      },
    ]);
  });

  it("leaves the note out when the quote has none", async () => {
    const { client, calls } = liveClient({ "POST /jobs/j1/quote": { status: 201, data: { id: "q2" } } });
    const { note: _note, ...quoteWithoutNote } = expectedApprovedJob.quote;

    await client.saveJob({ ...expectedApprovedJob, status: "quoted", quote: quoteWithoutNote });

    assert.equal("note" in (calls[0].body as object), false);
  });

  it("refuses to send a quote whose arrival is not a display time, without calling the API", async () => {
    const { client, calls } = liveClient({});
    const quoted: Job = { ...expectedApprovedJob, status: "quoted", quote: { ...expectedApprovedJob.quote, arrival: { from: "", to: "" } } };

    await assert.rejects(client.saveJob(quoted), /arrival/);
    assert.deepEqual(calls, []);
  });

  it("moves any other status with POST /jobs/:id/transition", async () => {
    const { client, calls } = liveClient({ "POST /jobs/j1/transition": { status: 200, data: { id: "j1", state: "en_route" } } });

    await client.saveJob({ ...expectedApprovedJob, status: "en_route" });

    assert.deepEqual(calls, [
      { method: "POST", url: `${API}/v1/owner/jobs/j1/transition`, body: { to: "en_route", reason: "Owner moved the job to en_route in the app" } },
    ]);
  });

  it("records the final total and the owner's price reason as the reason for done", async () => {
    const { client, calls } = liveClient({ "POST /jobs/j1/transition": { status: 200, data: { id: "j1", state: "done" } } });

    await client.saveJob({ ...expectedApprovedJob, status: "done", finalTotal: 190, finalPriceReason: "Replaced the flapper too" });

    assert.deepEqual(calls[0].body, { to: "done", reason: "Finished at $190: Replaced the flapper too" });
  });
});

describe("jobs service on the live client", () => {
  it("advances an approved job to en_route through the API", async () => {
    const { client, calls } = liveClient({
      "GET /jobs/j1": { status: 200, data: approvedJob },
      "POST /jobs/j1/transition": { status: 200, data: { id: "j1", state: "en_route" } },
    });
    const service = createJobsService(client, { now: () => "2026-10-28T00:20:00-05:00" });

    const moved = await service.updateJobStatus("j1", "en_route");

    assert.equal(moved?.status, "en_route");
    assert.deepEqual(calls.map(({ method, url }) => `${method} ${url}`), [
      `GET ${API}/v1/owner/jobs/j1`,
      `POST ${API}/v1/owner/jobs/j1/transition`,
    ]);
  });

  it("sends the owner's quote for a conversation through the API", async () => {
    const { client, calls } = liveClient({
      "GET /jobs": { status: 200, data: [approvedJob] },
      "POST /jobs/j1/quote": { status: 201, data: { id: "q2" } },
    });
    const service = createJobsService(client);

    const sent = await service.sendQuote("c1", expectedApprovedJob.quote);

    assert.equal(sent?.status, "quoted");
    assert.deepEqual(calls.at(-1)?.body, {
      lines: [
        { label: "Visit", min: 45, max: 45 },
        { label: "Fill valve repair", min: 60, max: 90 },
      ],
      arrivalFrom: "2026-10-28T00:55:00-05:00",
      arrivalTo: "2026-10-28T01:25:00-05:00",
      note: "Excludes floor damage",
    });
  });
});
