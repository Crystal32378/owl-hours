import type { Business } from "../../../shared/data/types.ts";
import { businessRows } from "../lib/businessRows.ts";
import type { BusinessRowExtras, BusinessRowValues } from "../lib/businessRows.ts";
import { businessRuntime } from "./businessRuntime.ts";
import type { BusinessService } from "../services/businessService.ts";
import { useLoad } from "./useLoad.ts";

export type BusinessDeps = { service: BusinessService };

// Serializable by design: it crosses into the DOM component as props.
export type BusinessView = {
  name: string;
  rows: BusinessRowValues;
};

export type BusinessState =
  | { status: "loading"; reload: () => Promise<void> }
  | { status: "failed"; retry: () => Promise<void>; reload: () => Promise<void> }
  | { status: "ready"; view: BusinessView; reload: () => Promise<void> };

// A signed-in owner always has a business, so there is no empty state: loading
// draws the skeleton and failure draws the error state. reload re-reads the
// shared business service; the business route calls it on every focus so saved
// prices are visible when coming back from OwPrices.
export function useBusiness(deps?: Partial<BusinessDeps>): BusinessState {
  const service = deps?.service ?? businessRuntime().service;
  const { state, reload } = useLoad(() => loadBusiness(service), [service]);

  if (state.status === "loading") return { status: "loading", reload };
  if (state.status === "failed") return { status: "failed", retry: state.retry, reload };

  return {
    status: "ready",
    view: { name: state.value.business.name, rows: businessRows(state.value.business, state.value.extras) },
    reload,
  };
}

async function loadBusiness(
  service: BusinessService,
): Promise<{ business: Business; extras: BusinessRowExtras } | { failed: true }> {
  try {
    const [business, extras] = await Promise.all([service.getBusiness(), service.getRowExtras()]);
    return { business, extras };
  } catch {
    return { failed: true };
  }
}
