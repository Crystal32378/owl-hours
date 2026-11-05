// The range Zukki suggests to the owner on the offer, from the business's own
// price rules: the visit, the cheapest repair and, inside its window, the night
// fee. The seeded Northside offer ($45 + $25 + $60–90 = $130–160) follows it.

export type PriceRule = {
  item: string;
  kind: string;
  min_amount: number;
  max_amount: number;
  conditions: string | null;
};

export type MoneyRange = { min: number; max: number };

export function suggestedQuote(rules: PriceRule[], localHour: number): MoneyRange | null {
  const visit = rules.find((rule) => rule.kind === "callout");
  const repair = cheapest(rules.filter((rule) => rule.kind === "repair_range"));
  if (!visit && !repair) return null;

  const night = rules.find((rule) => rule.kind === "night_fee" && isInWindow(rule.conditions, localHour));
  const lines = [visit, repair, night].filter((rule): rule is PriceRule => rule !== undefined);
  return {
    min: lines.reduce((sum, rule) => sum + rule.min_amount, 0),
    max: lines.reduce((sum, rule) => sum + rule.max_amount, 0),
  };
}

function cheapest(repairs: PriceRule[]): PriceRule | undefined {
  return repairs.reduce<PriceRule | undefined>((best, rule) => (!best || rule.min_amount < best.min_amount ? rule : best), undefined);
}

// "10 PM-7 AM": from the first hour up to, not including, the second; a window
// that crosses midnight wraps. An unreadable window never applies.
function isInWindow(window: string | null, hour: number): boolean {
  const match = /^\s*(\d{1,2})\s*(AM|PM)\s*[-–]\s*(\d{1,2})\s*(AM|PM)\s*$/i.exec(window ?? "");
  if (!match) return false;
  const from = toHour24(Number(match[1]), match[2]!);
  const to = toHour24(Number(match[3]), match[4]!);
  return from <= to ? hour >= from && hour < to : hour >= from || hour < to;
}

function toHour24(hour: number, meridiem: string): number {
  const isPm = meridiem.toUpperCase() === "PM";
  return (hour % 12) + (isPm ? 12 : 0);
}
