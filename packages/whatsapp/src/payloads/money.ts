// Price formatting shared by 07 and 13; USD keeps the $ prefix.
export function money(amount: number, currency: string): string {
  return currency === "USD" ? `$${amount}` : `${amount} ${currency}`;
}

export function moneyRange(min: number, max: number, currency: string): string {
  if (min === max) return money(min, currency);
  return currency === "USD" ? `$${min}–${max}` : `${min}–${max} ${currency}`;
}
