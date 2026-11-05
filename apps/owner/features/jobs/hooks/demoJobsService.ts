import { sharedThreadStore } from "../../../shared/data/threadStore.ts";
import type { ISODate } from "../../../shared/data/types.ts";
import { createDemoClock } from "../lib/demoClock.ts";
import { createFakeJobsClient, createJobsService } from "../services/jobsService.ts";
import type { JobsService } from "../services/jobsService.ts";

// OwQuote's status bar reads 12:07 AM, the seed's "Quote sent and approved" time. Starting the jobs
// clock there (not at the request's DEMO_NOW, 12:05) keeps every later timeline entry in order.
const QUOTE_DEMO_NOW = "2026-10-28T00:07:00-05:00";

// The jobs hooks' service when the live API is not configured (jobsRoot.ts): a fake client that approves quotes on the
// customer's behalf, on a demo clock so times match the designs.
export function createDemoJobsService(): JobsService {
  const now = createDemoClock(QUOTE_DEMO_NOW);
  return createJobsService(createFakeJobsClient({ now }), { now });
}

// One module-level demo service shared by useJobs, useJob, the finish hook and useQuoteDraft, so a
// status change on one screen shows on the others. Every call hands out the same store, and a sent
// quote lands in the shared thread store, where the chat reads it.
export function sharedDemoJobsService(): JobsService {
  if (!sharedService) {
    const now = sharedDemoClock();
    sharedService = createJobsService(createFakeJobsClient({ now, threads: sharedThreadStore() }), { now });
  }
  return sharedService;
}

// The demo clock the hooks segment jobs with: the designs' night, in the demo's own offset.
export function sharedDemoNow(): ISODate {
  return sharedDemoClock()();
}

// Tests start every case from the seed: the next consumer sees a fresh store again.
export function resetSharedDemoJobsService(): void {
  sharedClock = null;
  sharedService = null;
}

let sharedClock: (() => ISODate) | null = null;
let sharedService: JobsService | null = null;

function sharedDemoClock(): () => ISODate {
  if (!sharedClock) sharedClock = createDemoClock(QUOTE_DEMO_NOW);
  return sharedClock;
}
