// A job the owner just accepted (API `proposed`, no quote sent yet) is not a job in the Jobs list:
// the quote starts from the chat. It stays reachable by its conversation for the quote draft.
process.env.TZ = "America/Bogota";

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createOwnerApi } from "../../../shared/infra/ownerApi.ts";
import { createLiveJobsClient } from "./liveJobsClient.ts";

const API = "https://api.example.com";

const unquotedJob = {
  id: "j2", conversationId: "c2", businessId: "b1", title: "Kitchen sink leaking", state: "proposed",
  customerName: "Carlos", technicianId: null, technician: null, arrivalWindow: null, currency: "USD",
  total: { min: 105, max: 135 }, finalTotal: null, location: null, quote: null, shareConsent: "not_asked", timeline: [],
};
const quotedJob = { ...unquotedJob, id: "j3", conversationId: "c3", state: "owner_confirmed",
  quote: { id: "q3", status: "sent", lines: [{ label: "Leak repair", min: 60, max: 90 }], total: { min: 60, max: 90 },
    arrivalFrom: "2026-10-28T05:55:00+00:00", arrivalTo: "2026-10-28T06:25:00+00:00", note: null, sentAt: "2026-10-28T05:10:00+00:00" } };

function client() {
  const fetch = (async () => Response.json({ success: true, data: [unquotedJob, quotedJob] })) as unknown as typeof globalThis.fetch;
  return createLiveJobsClient(createOwnerApi({ apiUrl: API, getAccessToken: async () => "tok", fetch }), { now: () => new Date("2026-10-28T00:07:00-05:00") });
}

describe("live jobs before the quote", () => {
  it("leaves an unquoted job out of the list", async () => {
    assert.deepEqual((await client().listJobs()).map((job) => job.id), ["j3"]);
  });

  it("still finds it by its conversation for the quote draft", async () => {
    assert.equal((await client().findJobByConversationId("c2"))?.id, "j2");
  });
});
