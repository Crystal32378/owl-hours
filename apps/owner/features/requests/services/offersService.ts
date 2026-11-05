import { conversations as seedConversations, offers as seedOffers } from "../../../shared/data/mock.ts";
import type { DeclineReason, ID, MoneyRange, OfferStatus, RequestOffer } from "../../../shared/data/types.ts";

// The live API sends no suggested quote when Zukki could not price the request, which the
// shared RequestOffer cannot hold yet, so this feature widens that one field.
export type Offer = Omit<RequestOffer, "suggestedQuote"> & { suggestedQuote: MoneyRange | null };

export type OffersClient = {
  listOffers(): Promise<Offer[]>; // newest first
  findOffer(id: ID): Promise<Offer | null>;
  saveOffer(offer: Offer): Promise<void>;
  findConversationId(offerId: ID): Promise<ID | null>;
};

export type OffersService = {
  listOffers(): Promise<Offer[]>;
  getOffer(id: ID): Promise<Offer | null>;
  accept(id: ID): Promise<Offer | null>;
  decline(id: ID, reason?: DeclineReason): Promise<Offer | null>;
  findChat(offerId: ID): Promise<ID | null>; // the conversation an accepted offer opened
};

export function createOffersService(client: OffersClient): OffersService {
  return {
    listOffers: () => client.listOffers(),
    getOffer: (id) => client.findOffer(id),
    accept: (id) => moveOfferedTo(client, id, "accepted"),
    decline: (id, reason) => moveOfferedTo(client, id, "declined", reason),
    findChat: (offerId) => findChatOfAccepted(client, offerId),
  };
}

// In-memory client seeded with a private copy of the demo offers and their conversations.
export function createFakeOffersClient(): OffersClient {
  const offersById = new Map<ID, Offer>(structuredClone(seedOffers).map((offer) => [offer.id, offer]));
  const conversationIdByOfferId = new Map(seedConversations.map((conversation) => [conversation.offerId, conversation.id]));

  return {
    listOffers: async () => structuredClone([...offersById.values()]),
    findOffer: async (id) => structuredClone(offersById.get(id) ?? null),
    saveOffer: async (offer) => {
      offersById.set(offer.id, structuredClone(offer));
    },
    findConversationId: async (offerId) => conversationIdByOfferId.get(offerId) ?? null,
  };
}

// Only an offer that is still "offered" can be answered; anything else yields null.
// A decline keeps the chosen sheet reason, so Requests can read it back.
async function moveOfferedTo(
  client: OffersClient,
  id: ID,
  status: OfferStatus,
  declineReason?: DeclineReason,
): Promise<Offer | null> {
  const offer = await client.findOffer(id);
  if (offer?.status !== "offered") return null;

  const answered: Offer = declineReason === undefined ? { ...offer, status } : { ...offer, status, declineReason };
  try {
    await client.saveOffer(answered);
  } catch (error) {
    if (await isStillOffered(client, id)) throw error;
    return null;
  }
  return answered;
}

// A save the backend refused because the offer moved on (it expired) is a refused answer,
// not a failure; anything that left the offer untouched is a real error.
async function isStillOffered(client: OffersClient, id: ID): Promise<boolean> {
  const offer = await client.findOffer(id);
  return offer?.status === "offered";
}

// Only an accepted offer has a chat to open.
async function findChatOfAccepted(client: OffersClient, offerId: ID): Promise<ID | null> {
  const offer = await client.findOffer(offerId);
  if (offer?.status !== "accepted") return null;

  return client.findConversationId(offerId);
}
