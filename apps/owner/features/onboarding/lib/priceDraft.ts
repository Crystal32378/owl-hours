// Prices-step draft on Continue: only complete prices are saved. A row opened with
// "Add a price" and left blank, or named but still at $0, never reaches the business.
import type { PriceItem } from "../../../shared/data/types.ts";
import { isValidPrice } from "../../business/lib/priceValidation.ts";

export function completePrices(draft: PriceItem[]): PriceItem[] {
  return draft.map(withTrimmedLabel).filter(isComplete);
}

function withTrimmedLabel(price: PriceItem): PriceItem {
  return { ...price, label: price.label.trim() };
}

function isComplete(price: PriceItem): boolean {
  return price.label !== "" && isValidPrice(price.amount);
}
