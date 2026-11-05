import type { OwnerEditApi } from "../../../shared/infra/ownerApi.ts";
import type { BusinessService } from "../../business/services/businessService.ts";

// The Requests "Taking requests" switch: whether the business gets new requests now.
export type TakingRequestsClient = {
  load(): Promise<boolean>;
  store(takingRequests: boolean): Promise<boolean>;
};

type ApiMe = { businesses: { takingRequests: boolean }[] };
type ApiBusiness = { takingRequests: boolean };

// Live: GET /me lists the caller's business first, the one PATCH /business changes.
export function createLiveTakingRequestsClient(api: OwnerEditApi): TakingRequestsClient {
  return {
    load: async () => ((await api.get("/me")) as ApiMe).businesses[0]?.takingRequests ?? false,
    store: async (takingRequests) => ((await api.patch("/business", { takingRequests })) as ApiBusiness).takingRequests,
  };
}

// Demo: the same switch Settings shows, so turning it off on one screen shows on the other.
export function createDemoTakingRequestsClient(business: BusinessService): TakingRequestsClient {
  return {
    load: async () => (await business.getSettings()).takingRequests,
    store: async (takingRequests) => {
      const saved = await business.saveSettings({ ...(await business.getSettings()), takingRequests });
      return saved.takingRequests;
    },
  };
}
