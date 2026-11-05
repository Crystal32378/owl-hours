import type { Offer } from "../services/offersService.ts";

// What the Requests list remembers between loads. Pure: no React, no I/O.
// "loading" draws nothing yet; "failed" draws the error state; "ready" draws
// the rows, with refreshFailed marking a stale reload that kept the rows.
export type RequestsLoadState =
  | { status: "loading" }
  | { status: "failed" }
  | { status: "ready"; offers: Offer[]; refreshFailed: boolean };

export type RequestsLoadEvent = { kind: "loaded"; offers: Offer[] } | { kind: "failed" };

export function initialRequestsLoadState(): RequestsLoadState {
  return { status: "loading" };
}

export function requestsLoadReducer(state: RequestsLoadState, event: RequestsLoadEvent): RequestsLoadState {
  if (event.kind === "loaded") return readyWith(event.offers);
  return failedKeeping(state);
}

function readyWith(offers: Offer[]): RequestsLoadState {
  return { status: "ready", offers, refreshFailed: false };
}

function failedKeeping(state: RequestsLoadState): RequestsLoadState {
  if (state.status === "ready") return { status: "ready", offers: state.offers, refreshFailed: true };
  return { status: "failed" };
}
