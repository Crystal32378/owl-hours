// Prices-step rows, composed from copys ("$" and "+" are glue, "at cost" is display copy for
// the "at_cost" fee): "$45", "from $60", "Night, 10 PM–7 AM", "+$25", "at cost", "5 km".
import { onboardingCopys } from "../copys/onboardingCopys.ts";
import type { ExtraFee, PriceItem } from "../../../shared/data/types.ts";

// The owl's lead on the prices step: an empty list means nothing was imported.
export function pricesLead(prices: readonly PriceItem[]): string {
  return prices.length > 0 ? onboardingCopys.pricesLead : onboardingCopys.pricesLeadEmpty;
}

export function priceAmountText(price: Pick<PriceItem, "amount" | "from">): string {
  const amount = `${onboardingCopys.currency}${price.amount}`;
  return price.from ? `${onboardingCopys.fromWord} ${amount}` : amount;
}

export function feeLabelText(fee: Pick<ExtraFee, "label" | "window">): string {
  return fee.window ? `${fee.label}, ${fee.window}` : fee.label;
}

export function feeAmountText(fee: Pick<ExtraFee, "amount">): string {
  if (fee.amount === "at_cost") return onboardingCopys.atCost;

  return `${onboardingCopys.plusSign}${onboardingCopys.currency}${fee.amount}`;
}

export function radiusText(radiusKm: number): string {
  return `${radiusKm} ${onboardingCopys.kmUnit}`;
}
