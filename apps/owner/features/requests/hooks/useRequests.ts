import { useCallback, useEffect, useRef, useState } from "react";
import type { ISODate } from "../../../shared/data/types.ts";
import { requestsListView } from "../lib/requestsList.ts";
import type { RequestsListView } from "../lib/requestsList.ts";
import { initialRequestsLoadState, requestsLoadReducer } from "../lib/requestsLoadState.ts";
import type { RequestsLoadState } from "../lib/requestsLoadState.ts";
import type { OffersService } from "../services/offersService.ts";
import type { TakingRequestsClient } from "../services/takingRequestsService.ts";
import { createRequestsRuntime } from "./requestsRuntime.ts";

const TICK_MS = 1000;

export type RequestsDeps = {
  service: OffersService;
  clock: () => ISODate;
  takingRequests: TakingRequestsClient;
};

// "loading" draws nothing; "failed" draws the error state and retries the load;
// "ready" draws the rows, with refreshFailed marking a stale reload that kept them,
// and the "Taking requests" switch, which saves the business setting.
export type RequestsList =
  | { status: "loading" }
  | { status: "failed"; retry: () => Promise<void> }
  | {
      status: "ready";
      view: RequestsListView;
      refreshFailed: boolean;
      retry: () => Promise<void>;
      setTakingRequests: (takingRequests: boolean) => Promise<void>;
    };

// `reload` refetches without clearing the rows shown; a failed reload keeps the
// rows and only marks refreshFailed so the screen shows a small notice.
export type RequestsListResult = { requests: RequestsList; reload: () => void };

// Pass stable deps (module constants or memoized): changing them reloads the list.
export function useRequests(deps?: Partial<RequestsDeps>): RequestsListResult {
  const [defaults] = useState(createDefaultDeps);
  const service = deps?.service ?? defaults.service;
  const clock = deps?.clock ?? defaults.clock;
  const takingRequests = deps?.takingRequests ?? defaults.takingRequests;

  const [loaded, setLoaded] = useState<RequestsLoadState>(initialRequestsLoadState);
  const [isTakingRequests, setIsTakingRequests] = useState<boolean | null>(null);
  // Counts the owner's saves: a read that started before the latest save is stale and is dropped.
  const saves = useRef(0);
  const [now, setNow] = useState(clock);
  const [reloadToken, setReloadToken] = useState(0);
  const reload = useCallback(() => setReloadToken((token) => token + 1), []);

  useEffect(() => {
    let isCurrent = true;
    service
      .listOffers()
      .then((offers) => {
        if (isCurrent) setLoaded((shown) => requestsLoadReducer(shown, { kind: "loaded", offers }));
      })
      .catch(() => {
        if (isCurrent) setLoaded((shown) => requestsLoadReducer(shown, { kind: "failed" }));
      });
    // The switch loads on its own: a failed read keeps the last value and never hides the requests.
    const savesBeforeRead = saves.current;
    takingRequests
      .load()
      .then((isTaking) => {
        if (isCurrent && saves.current === savesBeforeRead) setIsTakingRequests(isTaking);
      })
      .catch(() => {});
    return () => {
      isCurrent = false;
    };
  }, [service, takingRequests, reloadToken]);

  useEffect(() => {
    const timer = setInterval(() => setNow(clock()), TICK_MS);
    return () => clearInterval(timer);
  }, [clock]);

  // The switch moves at once; a refused save puts it back where the business still is.
  async function setTakingRequests(next: boolean): Promise<void> {
    saves.current += 1;
    setIsTakingRequests(next);
    const saved = await takingRequests.store(next).catch(() => !next);
    setIsTakingRequests(saved);
  }

  return { requests: toRequestsList(loaded, now, isTakingRequests, reload, setTakingRequests), reload };
}

function toRequestsList(
  loaded: RequestsLoadState,
  now: ISODate,
  isTakingRequests: boolean | null,
  reload: () => void,
  setTakingRequests: (takingRequests: boolean) => Promise<void>,
): RequestsList {
  if (loaded.status === "loading") return { status: "loading" };
  if (loaded.status === "failed") return { status: "failed", retry: async () => reload() };
  return {
    status: "ready",
    view: requestsListView(loaded.offers, now, isTakingRequests),
    refreshFailed: loaded.refreshFailed,
    retry: async () => reload(),
    setTakingRequests,
  };
}

function createDefaultDeps(): RequestsDeps {
  return createRequestsRuntime();
}
