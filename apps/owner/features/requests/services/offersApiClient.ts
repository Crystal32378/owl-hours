import { OwnerApiError } from "../../../shared/infra/ownerApi.ts";
import type { OwnerApi } from "../../../shared/infra/ownerApi.ts";
import type { DeclineReason, ID, Media, MoneyRange, OfferStatus } from "../../../shared/data/types.ts";
import type { Offer, OffersClient } from "./offersService.ts";
import { localTimestamp } from "../../../shared/lib/localIsoString.ts";
import { requestsCopys } from "../copys/requestsCopys.ts";

// One offer as GET /offers returns it (supabase owner_offers, media links signed by the API).
type ApiOffer = {
  id: ID;
  conversationId: ID | null;
  status: string;
  urgent: boolean;
  distanceKm: number | null;
  suggestedQuote: MoneyRange | null;
  offeredAt: string;
  expiresAt: string;
  declineReason: DeclineReason | null;
  title: string | null;
  category: string | null;
  zukkiSummary: string | null;
  customerName: string | null;
  approxLocation: string | null;
  customerQuote: string | null;
  media: ApiMedia[];
};

type ApiMedia = { kind: string; durationMs: number | null; url: string | null; thumbUrl: string | null };

const OWNER_STATUSES: readonly OfferStatus[] = ["offered", "accepted", "declined", "expired"];
const MS_PER_SECOND = 1000;

// The live offers client: the API has no single-offer route, so it keeps every offer it
// read or answered, by id, and finds the conversation of an offer from that record.
export function createOffersApiClient(api: OwnerApi): OffersClient {
  const offersById = new Map<ID, Offer>();
  const conversationIdByOfferId = new Map<ID, ID>();

  async function readOffers(status: OfferStatus): Promise<Offer[]> {
    const rows = (await api.get(`/offers?status=${status}`)) as ApiOffer[];
    const offers = rows.filter(hasOwnerStatus).map(toOffer);
    rows.forEach(rememberConversation);
    offers.forEach((offer) => offersById.set(offer.id, offer));
    return offers;
  }

  function rememberConversation(row: ApiOffer) {
    if (row.conversationId) conversationIdByOfferId.set(row.id, row.conversationId);
  }

  async function saveOffer(offer: Offer): Promise<void> {
    try {
      await postAnswer(api, offer);
      offersById.set(offer.id, offer);
    } catch (error) {
      if (isOfferExpired(error)) offersById.set(offer.id, { ...offer, status: "expired" });
      throw error;
    }
  }

  return {
    listOffers: async () => newestFirst((await Promise.all(OWNER_STATUSES.map(readOffers))).flat()),
    // Every status is re-read, so an offer answered elsewhere carries its new status instead of the cached one.
    findOffer: async (id) => {
      await Promise.all(OWNER_STATUSES.map(readOffers));
      return offersById.get(id) ?? null;
    },
    saveOffer,
    findConversationId: async (offerId) => conversationIdByOfferId.get(offerId) ?? null,
  };
}

function postAnswer(api: OwnerApi, offer: Offer): Promise<unknown> {
  const path = `/offers/${encodeURIComponent(offer.id)}`;
  if (offer.status === "accepted") return api.post(`${path}/accept`);
  return api.post(`${path}/decline`, { reason: offer.declineReason ?? "other" });
}

function isOfferExpired(error: unknown): boolean {
  return error instanceof OwnerApiError && error.status === 409 && error.code === "offer_expired";
}

function hasOwnerStatus(row: ApiOffer): row is ApiOffer & { status: OfferStatus } {
  return (OWNER_STATUSES as readonly string[]).includes(row.status);
}

function newestFirst(offers: Offer[]): Offer[] {
  return [...offers].sort((a, b) => Date.parse(b.offeredAt) - Date.parse(a.offeredAt));
}

function toOffer(row: ApiOffer & { status: OfferStatus }): Offer {
  const offer: Offer = {
    id: row.id,
    customerName: row.customerName ?? "",
    title: row.title ?? untitledRequestTitle(row.category),
    urgent: row.urgent,
    distanceKm: row.distanceKm,
    approxLocation: row.approxLocation ?? "",
    media: withPictureFirst(row.media.flatMap(toMedia)),
    zukkiSummary: row.zukkiSummary ?? "",
    suggestedQuote: row.suggestedQuote,
    offeredAt: localTimestamp(row.offeredAt),
    expiresAt: localTimestamp(row.expiresAt),
    status: row.status,
  };
  if (row.customerQuote) offer.customerQuote = row.customerQuote;
  if (row.declineReason) offer.declineReason = row.declineReason;
  return offer;
}

// A request picked from the category list has no title until the customer describes it.
function untitledRequestTitle(category: string | null): string {
  if (!category) return requestsCopys.serviceRequest;
  const categoryName = category.charAt(0).toUpperCase() + category.slice(1);
  return `${categoryName} ${requestsCopys.requestWord}`;
}

// The card and the list show the first media. Live videos have no thumbnail, so they follow what has a picture.
function withPictureFirst(media: Media[]): Media[] {
  return [...media.filter((item) => item.thumbUrl), ...media.filter((item) => !item.thumbUrl)];
}

// Only video and image evidence reach the owner; a photo without its own thumbnail shows itself.
function toMedia(media: ApiMedia): Media[] {
  const url = media.url ?? "";
  if (media.kind === "image") return [{ kind: "photo", url, thumbUrl: media.thumbUrl ?? url }];
  if (media.kind !== "video") return [];

  const video: Media = { kind: "video", url, thumbUrl: media.thumbUrl ?? "" };
  if (media.durationMs !== null) video.durationS = Math.floor(media.durationMs / MS_PER_SECOND);
  return [video];
}
