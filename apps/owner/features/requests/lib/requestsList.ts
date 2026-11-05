import type { ID, ISODate, MoneyRange, RequestOffer } from "../../../shared/data/types.ts";
import { requestsListCopys } from "../copys/requestsListCopys.ts";
import { formatCountdown, secondsLeft } from "./countdown.ts";

// The fields the list reads; the quote may be missing when Zukki could not price the request.
export type ListedOffer = Pick<
  RequestOffer,
  "id" | "customerName" | "title" | "urgent" | "distanceKm" | "media" | "expiresAt" | "status"
> & { suggestedQuote: MoneyRange | null };

// The raised card of an offer still waiting for the owner.
export type WaitingRequestCard = {
  id: ID;
  isUrgent: boolean;
  distanceText: string | null; // "1.2 km"; null when the distance is unknown
  timeLeftText: string; // "4:32 left"
  title: string;
  subtitle: string; // "Ana L. · suggested quote $130–160"
  thumbUrl: string | null; // the first media's thumbnail; null draws no thumbnail
};

// One "Earlier tonight" row, with its outcome as text.
export type EarlierRequestRow = { id: ID; title: string; subtitle: string; statusText: string };

export type RequestsEmptyState = "not-taking" | "no-requests";

// Serializable by design: it crosses into the DOM component as props.
export type RequestsListView = {
  isTakingRequests: boolean | null; // null until the business setting has loaded
  waiting: WaitingRequestCard[];
  earlier: EarlierRequestRow[];
  emptyState: RequestsEmptyState | null;
};

// An offered request whose time ran out leaves the cards and shows as Missed, as the
// design asks for an offer that expires while the screen is open.
export function requestsListView(offers: ListedOffer[], now: ISODate, isTakingRequests: boolean | null): RequestsListView {
  const waitingOffers = offers.filter((offer) => isWaiting(offer, now));
  const earlierOffers = offers.filter((offer) => !isWaiting(offer, now));
  return {
    isTakingRequests,
    waiting: waitingOffers.map((offer) => waitingCard(offer, now)),
    earlier: earlierOffers.map(earlierRow),
    emptyState: emptyStateOf(isTakingRequests, offers.length),
  };
}

function isWaiting(offer: ListedOffer, now: ISODate): boolean {
  return offer.status === "offered" && secondsLeft(offer.expiresAt, now) > 0;
}

function waitingCard(offer: ListedOffer, now: ISODate): WaitingRequestCard {
  return {
    id: offer.id,
    isUrgent: offer.urgent,
    distanceText: distanceText(offer.distanceKm),
    timeLeftText: `${formatCountdown(secondsLeft(offer.expiresAt, now))} ${requestsListCopys.timeLeft}`,
    title: offer.title,
    subtitle: waitingSubtitle(offer),
    thumbUrl: offer.media[0]?.thumbUrl ?? null,
  };
}

function waitingSubtitle(offer: ListedOffer): string {
  if (!offer.suggestedQuote) return offer.customerName;

  const { min, max } = offer.suggestedQuote;
  return `${offer.customerName} · ${requestsListCopys.suggestedQuote} $${min}–${max}`;
}

function earlierRow(offer: ListedOffer): EarlierRequestRow {
  return {
    id: offer.id,
    title: offer.title,
    subtitle: [offer.customerName, distanceText(offer.distanceKm)].filter(Boolean).join(" · "),
    statusText: outcomeText(offer.status),
  };
}

// Everything that is neither accepted nor declined went to another business: Missed.
function outcomeText(status: RequestOffer["status"]): string {
  if (status === "accepted") return requestsListCopys.accepted;
  if (status === "declined") return requestsListCopys.declined;
  return requestsListCopys.missed;
}

function distanceText(distanceKm: number | null): string | null {
  return distanceKm === null ? null : `${distanceKm.toFixed(1)} km`;
}

function emptyStateOf(isTakingRequests: boolean | null, offerCount: number): RequestsEmptyState | null {
  if (isTakingRequests === false) return "not-taking";
  return offerCount === 0 ? "no-requests" : null;
}
