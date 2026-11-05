import type { RequestOffer } from "../../../shared/data/types.ts";
import { requestsCopys } from "../copys/requestsCopys.ts";

// "Ana L. · 1.2 km, approximate"; only the name when the distance is unknown.
export function customerLine(offer: Pick<RequestOffer, "customerName" | "distanceKm">): string {
  if (offer.distanceKm === null) return offer.customerName;
  return `${offer.customerName} · ${offer.distanceKm} ${requestsCopys.approximateDistance}`;
}
