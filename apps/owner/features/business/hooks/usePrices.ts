import type { Business, ExtraFee, FeeInput, PriceItem } from "../../../shared/data/types.ts";
import { businessRuntime } from "./businessRuntime.ts";
import type { BusinessService } from "../services/businessService.ts";
import { useLoad } from "./useLoad.ts";

export type PricesDeps = { service: BusinessService };

// Serializable by design: it crosses into the DOM component as props; saving
// is a top-level async callback. An empty price list is not a load state: the
// screen draws its empty variant over the ready view.
export type PricesView = {
  prices: PriceItem[];
  fees: ExtraFee[];
  savePrices: (prices: PriceItem[]) => Promise<boolean>;
  saveFees: (fees: FeeInput[]) => Promise<boolean>;
};

export type PricesState =
  | { status: "loading"; reload: () => Promise<void> }
  | { status: "failed"; retry: () => Promise<void>; reload: () => Promise<void> }
  | { status: "ready"; view: PricesView; reload: () => Promise<void> };

export function usePrices(deps?: Partial<PricesDeps>): PricesState {
  const service = deps?.service ?? businessRuntime().service;
  const { state, reload, replace } = useLoad(() => loadPrices(service), [service]);

  if (state.status === "loading") return { status: "loading", reload };
  if (state.status === "failed") return { status: "failed", retry: state.retry, reload };

  async function savePrices(prices: PriceItem[]): Promise<boolean> {
    return showSaved(await service.savePrices(prices));
  }

  async function saveFees(fees: FeeInput[]): Promise<boolean> {
    return showSaved(await service.saveFees(fees));
  }

  // An invalid list saves nothing and keeps the screen as it is.
  function showSaved(saved: Business | null): boolean {
    if (!saved) return false;

    replace({ prices: saved.prices, fees: saved.fees });
    return true;
  }

  return { status: "ready", view: { prices: state.value.prices, fees: state.value.fees, savePrices, saveFees }, reload };
}

async function loadPrices(
  service: BusinessService,
): Promise<{ prices: PriceItem[]; fees: ExtraFee[] } | { failed: true }> {
  try {
    const business = await service.getBusiness();
    return { prices: business.prices, fees: business.fees };
  } catch {
    return { failed: true };
  }
}
