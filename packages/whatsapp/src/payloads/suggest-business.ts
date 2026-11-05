// Payload 07: the best-match card. Only lines the business actually has;
// prices come from its own rules.
import { buttonMessage, type OutgoingMessage, type ReplyButton } from "../client.ts";
import { BUTTON_BODY_MAX, FOOTER_MAX, HEADER_MAX, clip } from "./limits.ts";
import { money } from "./money.ts";
import { nounFor, type Category } from "./nouns.ts";

export type SuggestMatch = {
  businessId: string;
  businessName: string;
  rating: number | null;
  reviews: number | null;
  distanceKm: number | null;
  openNow: boolean;
  visit: number | null;
  nightFee: { amount: number; window: string | null } | null;
  repairFrom: number | null;
  repairLabel: string | null;
  etaMinutes: number | null;
  currency: string;
  takesNightJobs: boolean;
};

export function suggestButtons(businessId: string): ReplyButton[] {
  return [
    { id: `connect:${businessId}`, title: "Connect me" },
    { id: "another_option", title: "Show another option" },
  ];
}

export function suggestBusiness(input: {
  to: string;
  category: Category;
  match: SuggestMatch;
  afterTimeout?: boolean | undefined;
}): OutgoingMessage {
  return buttonMessage(input.to, {
    body: clip(suggestBody(input.match), BUTTON_BODY_MAX),
    buttons: suggestButtons(input.match.businessId),
    footer: clip(suggestFooter(input.category, input.match.takesNightJobs, input.afterTimeout ?? false), FOOTER_MAX),
    headerText: clip(input.match.businessName, HEADER_MAX),
  });
}

function suggestBody(match: SuggestMatch): string {
  const facts = [factRating(match), factDistance(match), match.openNow ? "open now" : null]
    .filter(isPresent)
    .join(" · ");
  const prices = [priceVisit(match), priceNight(match), priceRepair(match), priceEta(match)]
    .filter(isPresent)
    .join("\n");
  return [facts, prices].filter((part) => part.length > 0).join("\n\n") || match.businessName;
}

function suggestFooter(category: Category, takesNightJobs: boolean, afterTimeout: boolean): string {
  if (afterTimeout) return "Your video and details go with the request";
  return `Closest ${nounFor(category)} ${takesNightJobs ? "taking night jobs" : "open"} right now`;
}

function factRating(match: SuggestMatch): string | null {
  if (match.rating === null) return null;
  return `★ ${match.rating.toFixed(1)}${match.reviews === null ? "" : ` (${match.reviews})`}`;
}

function factDistance(match: SuggestMatch): string | null {
  if (match.distanceKm === null) return null;
  return `${match.distanceKm.toFixed(1)} km`;
}

function priceVisit(match: SuggestMatch): string | null {
  if (match.visit === null) return null;
  return `Visit: ${money(match.visit, match.currency)}`;
}

function priceNight(match: SuggestMatch): string | null {
  if (match.nightFee === null) return null;
  const window = match.nightFee.window ? ` (${match.nightFee.window.replace(/\s*-\s*/, "–")})` : "";
  return `Night fee${window}: +${money(match.nightFee.amount, match.currency)}`;
}

function priceRepair(match: SuggestMatch): string | null {
  if (match.repairFrom === null) return null;
  return `${match.repairLabel ?? "Repair"}: from ${money(match.repairFrom, match.currency)}`;
}

function priceEta(match: SuggestMatch): string | null {
  if (match.etaMinutes === null) return null;
  return `Can arrive: in about ${match.etaMinutes} min`;
}

function isPresent(value: string | null): value is string {
  return value !== null;
}
