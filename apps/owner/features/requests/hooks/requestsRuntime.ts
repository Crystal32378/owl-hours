import { DEMO_NOW } from "../../../shared/data/mock.ts";
import type { ISODate } from "../../../shared/data/types.ts";
import { getOwnerLiveApi } from "../../../shared/infra/ownerApiRuntime";
import { createOffersApiClient } from "../services/offersApiClient.ts";
import { createFakeOffersClient, createOffersService } from "../services/offersService.ts";
import type { OffersService } from "../services/offersService.ts";
import { createDemoTakingRequestsClient, createLiveTakingRequestsClient } from "../services/takingRequestsService.ts";
import type { TakingRequestsClient } from "../services/takingRequestsService.ts";
import { demoBusinessService } from "../../business/services/businessService.ts";

// What the requests hooks run on by default.
export type RequestsRuntime = { service: OffersService; clock: () => ISODate; takingRequests: TakingRequestsClient };

let liveRuntime: RequestsRuntime | null = null;
let demoRuntime: RequestsRuntime | null = null;

// Composition root of the requests hooks: one service shared by every screen, so an answer given
// on the detail shows on the list. Live runs on the real clock; the demo on fake offers and a clock
// that starts at DEMO_NOW when the app first shows a request, so the demo replays on each app start.
export function createRequestsRuntime(): RequestsRuntime {
  return getLiveRuntime() ?? getDemoRuntime();
}

function getDemoRuntime(): RequestsRuntime {
  demoRuntime ??= {
    service: createOffersService(createFakeOffersClient()),
    clock: createDemoClock(),
    takingRequests: createDemoTakingRequestsClient(demoBusinessService),
  };
  return demoRuntime;
}

function getLiveRuntime(): RequestsRuntime | null {
  if (liveRuntime) return liveRuntime;

  const api = getOwnerLiveApi();
  if (!api) return null;
  liveRuntime = {
    service: createOffersService(createOffersApiClient(api)),
    clock: () => new Date().toISOString(),
    takingRequests: createLiveTakingRequestsClient(api),
  };
  return liveRuntime;
}

// The demo offer expires in 2026, so the clock starts at DEMO_NOW and advances with real time since mount.
function createDemoClock(): () => ISODate {
  const startedAt = Date.now();
  const demoStart = Date.parse(DEMO_NOW);
  return () => new Date(demoStart + (Date.now() - startedAt)).toISOString();
}
