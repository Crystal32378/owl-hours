import type { Business, ExtraFee, GeoPoint, PriceItem } from "../../../shared/data/types.ts";
import { businessCopys } from "../copys/businessCopys.ts";
import { priceAmountText } from "./priceFields.ts";

// Row values the Business type does not carry. The demo values are not in
// shared/data/mock.ts, so the fake client seeds them here (operator decision,
// odd/tasks/owner-business.md L2). Live has no imported-services count yet
// (no column), so it passes null and the website row shows the site alone.
// hasLocation is false while the business sits at the (0, 0) placeholder a new
// business starts at, as the demo business does.
export type BusinessRowExtras = { areaLabel: string; importedServices: number | null; hasLocation: boolean };

export const BUSINESS_DEMO: BusinessRowExtras = { areaLabel: "Northside", importedServices: 12, hasLocation: false };

// What the service-area map draws: a null center shows the world overview.
export type ServiceAreaMapView = { center: GeoPoint | null; radiusKm: number };

// Every value the OwBusiness rows show, derived from the business.
// Copy: handoff-ui/owner-app/design/html/OwBusiness.dc.html; the hours suffix
// and the "from"/"at cost" words are that file's own wording. The glue words
// live in copys/businessCopys.ts (pattern:
// features/requests/lib/mediaAltText.ts), so this module holds no visible
// strings and the rows stay byte-identical.
export type BusinessRowValues = {
  profile: string;
  prices: string;
  extraFees: string;
  hours: string;
  serviceArea: string;
  serviceAreaMap: ServiceAreaMapView;
  website: string;
};

export function businessRows(business: Business, extras: BusinessRowExtras = BUSINESS_DEMO): BusinessRowValues {
  return {
    profile: profileText(business),
    prices: business.prices.slice(0, 3).map(priceText).join(" · "),
    extraFees: business.fees.map(feeText).join(" · "),
    hours: hoursText(business),
    serviceArea: `${business.area.radiusKm} ${businessCopys.areaAround} ${extras.areaLabel}`,
    serviceAreaMap: { center: extras.hasLocation ? business.area.center : null, radiusKm: business.area.radiusKm },
    website: websiteText(business, extras.importedServices),
  };
}

function profileText(business: Business): string {
  return `${tradeName(business.category)} · ${business.rating.value} ${businessCopys.ratingWord} · ${business.technicians} ${businessCopys.techniciansWord}`;
}

// The demo category "plumbing" reads "Plumber" in the design; anything else
// falls back to a capitalized category.
const TRADE_NAMES: Record<string, string> = { plumbing: businessCopys.tradePlumber };

function tradeName(category: string): string {
  return TRADE_NAMES[category] ?? (category.charAt(0).toUpperCase() + category.slice(1));
}

function priceText(price: PriceItem): string {
  return `${price.label}${price.from ? ` ${businessCopys.fromWord}` : ""} ${priceAmountText(price.amount)}`;
}

function feeText(fee: ExtraFee): string {
  if (fee.amount === "at_cost") return `${fee.label} ${businessCopys.atCost}`;
  return `${fee.label}${fee.window ? ` ${fee.window}` : ""} +${priceAmountText(fee.amount)}`;
}

function hoursText(business: Business): string {
  if (!business.hours.nightUrgent) return business.hours.summary;
  return `${business.hours.summary} · ${businessCopys.nightUrgent}`;
}

function websiteText(business: Business, importedServices: number | null): string {
  const parts = [business.website, importedServices === null ? undefined : `${importedServices} ${businessCopys.servicesImported}`];
  return parts.filter((part) => part !== undefined && part !== "").join(" · ");
}
