import { createOwnerApi } from "../../../shared/infra/ownerApi.ts";
import type { OwnerApiOptions } from "../../../shared/infra/ownerApi.ts";
import { createBusinessApiClient } from "../services/businessApiClient.ts";
import { createBusinessService, demoBusinessService } from "../services/businessService.ts";
import type { BusinessService } from "../services/businessService.ts";
import { createFakeTestZukkiClient, createLiveTestZukkiClient } from "../services/testZukkiService.ts";
import type { TestZukkiClient } from "../services/testZukkiService.ts";

// What the business hooks run on: one business service shared by Business,
// Prices and Settings, and the Test Zukki client each screen session builds.
export type BusinessRoot = { service: BusinessService; createTestZukkiClient: () => TestZukkiClient };

// Live: the owner API; demo (null): the fake business and the design's Test Zukki answers.
export function businessRootFor(live: OwnerApiOptions | null): BusinessRoot {
  if (!live) return { service: demoBusinessService, createTestZukkiClient: createFakeTestZukkiClient };

  const send = live.fetch ?? fetch;
  return {
    service: createBusinessService(createBusinessApiClient(createOwnerApi(live))),
    createTestZukkiClient: () =>
      createLiveTestZukkiClient({ baseUrl: live.apiUrl, getToken: live.getAccessToken, push: (url, init) => send(url, init) }),
  };
}
