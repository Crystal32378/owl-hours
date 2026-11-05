// Spec: odd/tasks/owner-business-live.md S1: live mode runs the business
// screens and Test Zukki on the owner API; the demo keeps its fake data.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { demoBusinessService } from "../services/businessService.ts";
import { businessRootFor } from "./businessRoot.ts";

const API_URL = "https://api.example";

function recordingFetch(data: unknown) {
  const urls: string[] = [];
  const fetch = (async (url: string | URL | Request) => {
    urls.push(String(url));
    return Response.json({ success: true, data });
  }) as typeof globalThis.fetch;
  return { fetch, urls };
}

describe("businessRootFor", () => {
  it("runs the demo service and the demo Test Zukki without a live API", async () => {
    const root = businessRootFor(null);

    assert.equal(root.service, demoBusinessService);
    assert.deepEqual((await root.createTestZukkiClient().ask("gas heater?", [])).sources, []);
  });

  it("asks the live POST /test-zukki with the owner's token", async () => {
    const { fetch, urls } = recordingFetch({ businessId: "b1", reply: "Yes, tonight.", sources: ["Visit"] });
    const root = businessRootFor({ apiUrl: API_URL, getAccessToken: async () => "token", fetch });

    const answer = await root.createTestZukkiClient().ask("Can you come tonight?", []);

    assert.deepEqual(answer, { text: "Yes, tonight.", sources: ["Visit"] });
    assert.deepEqual(urls, [`${API_URL}/v1/owner/test-zukki`]);
  });

  it("reads the business from the live API", async () => {
    const { fetch, urls } = recordingFetch({});
    const root = businessRootFor({ apiUrl: API_URL, getAccessToken: async () => "token", fetch });

    await root.service.getSettings().catch(() => null);

    assert.deepEqual(urls, [`${API_URL}/v1/owner/business`]);
  });
});
