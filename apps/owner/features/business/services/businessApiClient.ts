import type { OwnerEditApi } from "../../../shared/infra/ownerApi.ts";
import type { Business, ExtraFee, FeeInput, ID, LinkedAccount, PriceItem } from "../../../shared/data/types.ts";
import { hoursSummary } from "../lib/hoursSummary.ts";
import type { OpeningHours } from "../lib/hoursSummary.ts";
import type { BusinessRowExtras } from "../lib/businessRows.ts";
import type { BusinessClient } from "./businessService.ts";

// The business as GET /v1/owner/business returns it (supabase owner_business).
type ApiBusiness = {
  id: ID;
  name: string;
  shortName: string;
  category: string;
  logoUrl: string | null;
  website: string | null;
  rating: { value: number | null; count: number };
  technicians: number;
  prices: PriceItem[];
  fees: { id: ID; label: string; amount: number | "at_cost"; window?: string; atNight: boolean }[];
  hours: OpeningHours[];
  nightJobs: boolean;
  area: { lat: number; lng: number; radiusKm: number } | null;
  hasLocation: boolean;
  takingRequests: boolean;
  acceptWindowMin: { urgent: number; other: number };
  linkedAccounts: { kind: LinkedAccount["kind"]; name: string }[];
};

// The live business client. Every write answers with the saved business, so
// the client keeps the last one it read and the settings come from it.
export function createBusinessApiClient(api: OwnerEditApi): BusinessClient {
  async function readBusiness(): Promise<ApiBusiness> {
    return (await api.get("/business")) as ApiBusiness;
  }

  async function putPrices(prices: PriceItem[]): Promise<Business> {
    const listed = prices.map(({ id, label, amount }) => ({ id, label, amount }));
    return toBusiness((await api.put("/business/prices", { prices: listed })) as ApiBusiness);
  }

  async function putFees(fees: FeeInput[]): Promise<Business> {
    const listed = fees.map(({ id, label, amount, atNight }) => ({ id, label, amount, atNight }));
    return toBusiness((await api.put("/business/fees", { fees: listed })) as ApiBusiness);
  }

  async function putHours(hours: OpeningHours[]): Promise<OpeningHours[]> {
    return ((await api.put("/business/hours", { hours })) as ApiBusiness).hours;
  }

  async function patchTakingRequests(takingRequests: boolean): Promise<boolean> {
    const saved = (await api.patch("/business", { takingRequests })) as ApiBusiness;
    return saved.takingRequests;
  }

  return {
    loadBusiness: async () => toBusiness(await readBusiness()),
    storePrices: putPrices,
    storeFees: putFees,
    loadHours: async () => (await readBusiness()).hours,
    storeHours: putHours,
    loadSettings: async () => ({ takingRequests: (await readBusiness()).takingRequests }),
    storeSettings: async (settings) => ({ takingRequests: await patchTakingRequests(settings.takingRequests) }),
    loadAccounts: async () => (await readBusiness()).linkedAccounts.map(toLinkedAccount),
    loadRowExtras: async () => toRowExtras(await readBusiness()),
  };
}

// False while the business is still at the (0, 0) placeholder a new business starts at.
export async function readHasLocation(api: OwnerEditApi): Promise<boolean> {
  return ((await api.get("/business")) as ApiBusiness).hasLocation;
}

function toBusiness(row: ApiBusiness): Business {
  const business: Business = {
    id: row.id,
    name: row.name,
    category: row.category,
    logoUrl: row.logoUrl ?? "",
    rating: { value: row.rating.value ?? 0, count: row.rating.count },
    technicians: row.technicians,
    prices: row.prices,
    fees: row.fees.map(toFee),
    hours: { summary: hoursSummary(row.hours), nightUrgent: row.nightJobs },
    area: row.area ? { center: { lat: row.area.lat, lng: row.area.lng }, radiusKm: row.area.radiusKm } : NO_AREA,
    takingRequests: row.takingRequests,
    acceptWindowMin: row.acceptWindowMin,
  };
  if (row.website) business.website = row.website;
  return business;
}

// The service area has no name of its own; it is drawn around the business.
function toRowExtras(row: ApiBusiness): BusinessRowExtras {
  return { areaLabel: row.shortName, importedServices: null, hasLocation: row.hasLocation };
}

// A business without a service area reads a zero radius rather than a made-up one.
const NO_AREA = { center: { lat: 0, lng: 0 }, radiusKm: 0 };

function toFee(fee: ApiBusiness["fees"][number]): ExtraFee {
  const listed = { id: fee.id, label: fee.label, amount: fee.amount, atNight: fee.atNight };
  return fee.window ? { ...listed, window: fee.window } : listed;
}

function toLinkedAccount(account: ApiBusiness["linkedAccounts"][number]): LinkedAccount {
  return { kind: account.kind, name: account.name, status: "connected" };
}
