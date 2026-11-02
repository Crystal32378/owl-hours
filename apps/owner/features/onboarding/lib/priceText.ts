// Prices-step rows, composed from copys ("$" is glue): "$45", "from $60", "5 km". Fee rows
// are FeeEditor's (features/business/lib/priceFields.ts).
import { onboardingCopys } from "../copys/onboardingCopys.ts";
import type { PriceItem } from "../../../shared/data/types.ts";

export function priceAmountText(price: Pick<PriceItem, "amount" | "from">): string {
  const amount = `${onboardingCopys.currency}${price.amount}`;
  return price.from ? `${onboardingCopys.fromWord} ${amount}` : amount;
}

export function radiusText(radiusKm: number): string {
  return `${radiusKm} ${onboardingCopys.kmUnit}`;
}
