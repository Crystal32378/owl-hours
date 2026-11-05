import type { OpeningHours } from "../lib/hoursSummary.ts";
import type { BusinessService } from "../services/businessService.ts";
import { businessRuntime } from "./businessRuntime.ts";
import { useLoad } from "./useLoad.ts";

export type HoursDeps = { service: BusinessService };

// Serializable by design: it crosses into the DOM component as props; saving
// is a top-level async callback.
export type HoursView = {
  hours: OpeningHours[];
  saveHours: (hours: OpeningHours[]) => Promise<boolean>;
};

export type HoursState =
  | { status: "loading"; reload: () => Promise<void> }
  | { status: "failed"; retry: () => Promise<void>; reload: () => Promise<void> }
  | { status: "ready"; view: HoursView; reload: () => Promise<void> };

export function useHours(deps?: Partial<HoursDeps>): HoursState {
  const service = deps?.service ?? businessRuntime().service;
  const { state, reload, replace } = useLoad(() => loadHours(service), [service]);

  if (state.status === "loading") return { status: "loading", reload };
  if (state.status === "failed") return { status: "failed", retry: state.retry, reload };

  // A rejected or failed save keeps the screen as it is, so the owner can retry.
  async function saveHours(hours: OpeningHours[]): Promise<boolean> {
    try {
      const saved = await service.saveHours(hours);
      if (!saved) return false;
      replace({ hours: saved });
      return true;
    } catch {
      return false;
    }
  }

  return { status: "ready", view: { hours: state.value.hours, saveHours }, reload };
}

async function loadHours(service: BusinessService): Promise<{ hours: OpeningHours[] } | { failed: true }> {
  try {
    return { hours: await service.getHours() };
  } catch {
    return { failed: true };
  }
}
