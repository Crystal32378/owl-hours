import type { ISODate } from "../../../shared/data/types.ts";
import type { OwnerApi } from "../../../shared/infra/ownerApi.ts";
import { localIsoString } from "../../../shared/lib/localIsoString.ts";
import { createJobsService } from "../services/jobsService.ts";
import type { JobsService } from "../services/jobsService.ts";
import { createLiveJobsClient } from "../services/liveJobsClient.ts";
import { sharedDemoJobsService, sharedDemoNow } from "./demoJobsService.ts";

// What the jobs hooks run on: one service shared by every jobs screen and the clock that segments the list.
export type JobsRoot = { service: JobsService; now: () => ISODate };

// S7: the live API when it is configured, the demo (fake client on the designs' clock) otherwise.
export function jobsRootFor(liveApi: OwnerApi | null): JobsRoot {
  if (!liveApi) return { service: sharedDemoJobsService(), now: sharedDemoNow };

  const now = () => localIsoString(new Date());
  return { service: createJobsService(createLiveJobsClient(liveApi), { now }), now };
}
