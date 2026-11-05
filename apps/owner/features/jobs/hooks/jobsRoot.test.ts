// S7: the jobs hooks use the live client when the owner API is configured, and the demo otherwise.
import { afterEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { createOwnerApi } from "../../../shared/infra/ownerApi.ts";
import { resetSharedDemoJobsService, sharedDemoJobsService, sharedDemoNow } from "./demoJobsService.ts";
import { jobsRootFor } from "./jobsRoot.ts";

afterEach(resetSharedDemoJobsService);

describe("jobsRootFor", () => {
  it("without the live API keeps the shared demo service and the demo clock", async () => {
    const root = jobsRootFor(null);

    assert.equal(root.service, sharedDemoJobsService());
    assert.equal(root.now, sharedDemoNow);
    assert.deepEqual((await root.service.listJobs()).map((job) => job.id), ["job_ana", "job_carlos", "job_lucia", "job_grace"]);
  });

  it("with the live API lists the jobs from GET /jobs", async () => {
    const urls: string[] = [];
    const fetch = (async (url: string) => {
      urls.push(url);
      return Response.json({ success: true, data: [] });
    }) as unknown as typeof globalThis.fetch;
    const root = jobsRootFor(createOwnerApi({ apiUrl: "https://api.example.com", getAccessToken: async () => "tok", fetch }));

    assert.deepEqual(await root.service.listJobs(), []);
    assert.deepEqual(urls, ["https://api.example.com/v1/owner/jobs"]);
    assert.match(root.now(), /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/);
  });
});
