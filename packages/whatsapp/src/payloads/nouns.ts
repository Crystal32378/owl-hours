// Directory categories and their customer-facing nouns (payloads 05-07, 09).
export type Category = "plumbing" | "electrical" | "locksmith" | "food" | "beauty" | "auto" | "pets";

const NOUNS: Record<Category, string> = {
  plumbing: "plumber",
  electrical: "electrician",
  locksmith: "locksmith",
  food: "place",
  beauty: "salon",
  auto: "mechanic",
  pets: "pet business",
};

export function nounFor(category: Category): string {
  return NOUNS[category];
}

// "a plumber who is open near you", "another place that is open near you".
export function someone(category: Category, options: { another?: boolean | undefined } = {}): string {
  const noun = nounFor(category);
  const who = category === "food" || category === "pets" ? "that" : "who";
  const which = options.another ? `another ${noun}` : article(noun);
  return `${which} ${who} is open near you`;
}

export function article(noun: string): string {
  return /^[aeiou]/i.test(noun) ? `an ${noun}` : `a ${noun}`;
}

export function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
