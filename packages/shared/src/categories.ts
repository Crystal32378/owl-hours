// Directory categories, matching the rows of WhatsApp payload 02
// (CATEGORY_LIST in packages/whatsapp/src/payloads/category-list.ts).
// tenants.category stores the value; the list reply id is "cat_<value>".
export const CATEGORIES = ["plumbing", "electrical", "locksmith", "food", "beauty", "auto", "pets"] as const;

export type Category = (typeof CATEGORIES)[number];

// Urgent home problems get the stop-the-damage steps first (01-PRODUCT.md).
export const HOME_EMERGENCY_CATEGORIES: readonly Category[] = ["plumbing", "electrical", "locksmith"];

export function isCategory(value: string): value is Category {
  return (CATEGORIES as readonly string[]).includes(value);
}

// "cat_other" (Something else) means: ask what they need. Unknown ids are null.
export function categoryFromListReply(id: string): Category | "other" | null {
  if (id === "cat_other") {
    return "other";
  }
  const value = id.startsWith("cat_") ? id.slice(4) : "";
  return isCategory(value) ? value : null;
}
