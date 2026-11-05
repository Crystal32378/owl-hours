import { useEffect, useState } from "react";
import { afterFailedLoad } from "../../../shared/lib/loadState.ts";
import type { LoadState } from "../../../shared/lib/loadState.ts";
import type { DeclineReason, ID, OfferStatus, PossibleFault } from "../../../shared/data/types.ts";
import type { AcceptOutcome } from "../lib/acceptOutcome.ts";
import { formatCountdown, offerWindowSeconds, secondsLeft } from "../lib/countdown.ts";
import { requestFaults } from "../lib/requestFaults.ts";
import type { Offer, OffersService } from "../services/offersService.ts";
import { createRequestsRuntime } from "./requestsRuntime.ts";

const TICK_MS = 1000;

export type RequestOfferDeps = {
  service: OffersService;
  clock: () => string; // current instant as an ISO date
};

export type RequestOfferDetails = Pick<
  Offer,
  "title" | "customerName" | "distanceKm" | "zukkiSummary" | "media" | "customerQuote" | "offeredAt"
> & { possibleFaults: PossibleFault[] };

// Serializable by design: it crosses into the DOM component as props.
export type RequestOfferView = {
  offer: RequestOfferDetails;
  status: OfferStatus;
  countdownText: string;
  secondsLeft: number;
  maxSeconds: number;
  isExpired: boolean;
  accept: () => Promise<AcceptOutcome>;
  decline: (reason?: DeclineReason) => Promise<boolean>;
};

// A failed load and an offer that does not exist both draw the error state, whose retry
// loads it again: neither leaves the screen blank.
export type RequestOfferScreen =
  | { status: "loading" }
  | { status: "failed"; retry: () => Promise<void> }
  | { status: "ready"; view: RequestOfferView };

// Pass stable deps (module constants or memoized): changing them restarts the clock.
export function useRequestOffer(id: ID, deps?: Partial<RequestOfferDeps>): RequestOfferScreen {
  const [defaults] = useState(createDefaultDeps);
  const service = deps?.service ?? defaults.service;
  const clock = deps?.clock ?? defaults.clock;

  const [offer, setOffer] = useState<LoadState<Offer | null>>("loading");
  const [attempt, setAttempt] = useState(0);
  const [now, setNow] = useState(clock);

  useEffect(() => {
    let isCurrent = true;
    service.getOffer(id).then(
      (loaded) => {
        if (isCurrent) setOffer(loaded);
      },
      () => {
        if (isCurrent) setOffer(afterFailedLoad);
      },
    );
    return () => {
      isCurrent = false;
    };
  }, [service, id, attempt]);

  useEffect(() => {
    const timer = setInterval(() => setNow(clock()), TICK_MS);
    return () => clearInterval(timer);
  }, [clock]);

  // A refused answer (the offer expired or was answered elsewhere) reloads the offer,
  // so the screen shows its current state instead of the one it was opened with.
  async function answer(transition: () => Promise<Offer | null>) {
    const answered = await transition();
    if (!answered) {
      const reloaded = await service.getOffer(id).catch(() => null);
      setOffer((current) => reloaded ?? current);
      return false;
    }

    setOffer(answered);
    return true;
  }

  async function acceptAndFindChat(): Promise<AcceptOutcome> {
    if (!(await answer(() => service.accept(id)))) return { kind: "not-offered" };

    return { kind: "accepted", chatId: await service.findChat(id) };
  }

  if (offer === "loading") return { status: "loading" };
  if (offer === "failed" || offer === null) return { status: "failed", retry: reload };

  const remaining = secondsLeft(offer.expiresAt, now);
  const view: RequestOfferView = {
    offer: { ...offer, possibleFaults: requestFaults(offer) },
    status: offer.status,
    countdownText: formatCountdown(remaining),
    secondsLeft: remaining,
    maxSeconds: offerWindowSeconds(offer),
    isExpired: remaining === 0 || offer.status === "expired",
    accept: acceptAndFindChat,
    decline: (reason) => answer(() => service.decline(id, reason)),
  };
  return { status: "ready", view };

  async function reload(): Promise<void> {
    setOffer("loading");
    setAttempt((count) => count + 1);
  }
}

function createDefaultDeps(): RequestOfferDeps {
  return createRequestsRuntime();
}
