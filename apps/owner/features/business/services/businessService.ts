import { accounts as seedAccounts, business as seedBusiness } from "../../../shared/data/mock.ts";
import type { Business, FeeInput, LinkedAccount, PriceItem } from "../../../shared/data/types.ts";
import type { BusinessRowExtras } from "../lib/businessRows.ts";
import { BUSINESS_DEMO } from "../lib/businessRows.ts";
import { isCompleteFee, withSavedFees } from "../lib/feeDraft.ts";
import { isValidPrice } from "../lib/priceValidation.ts";

// The settings switches of OwSettings. Field names are the coder's;
// the fake client seeds them on, on, on, off (the HTML aria-checked).
// Only takingRequests has a database column (tenants.accepts_now); the
// others exist in the demo only, so the live client leaves them out and the
// screen hides a switch it has no value for.
export type BusinessSettings = {
  takingRequests: boolean;
  urgentRequests?: boolean;
  ringOnSilentAtNight?: boolean;
  polishByDefault?: boolean;
};

export type BusinessClient = {
  loadBusiness: () => Promise<Business>;
  storePrices: (prices: PriceItem[]) => Promise<Business>;
  storeFees: (fees: FeeInput[]) => Promise<Business>;
  loadSettings: () => Promise<BusinessSettings>;
  storeSettings: (settings: BusinessSettings) => Promise<BusinessSettings>;
  loadAccounts: () => Promise<LinkedAccount[]>;
  loadRowExtras: () => Promise<BusinessRowExtras>;
};

export type BusinessService = {
  getBusiness: () => Promise<Business>;
  savePrices: (prices: PriceItem[]) => Promise<Business | null>;
  saveFees: (fees: FeeInput[]) => Promise<Business | null>;
  getSettings: () => Promise<BusinessSettings>;
  saveSettings: (settings: BusinessSettings) => Promise<BusinessSettings>;
  getAccounts: () => Promise<LinkedAccount[]>;
  getRowExtras: () => Promise<BusinessRowExtras>;
};

export function createBusinessService(client: BusinessClient): BusinessService {
  return {
    getBusiness: () => client.loadBusiness(),
    savePrices: (prices) => saveValidPrices(client, prices),
    saveFees: (fees) => saveCompleteFees(client, fees),
    getSettings: () => client.loadSettings(),
    saveSettings: (settings) => client.storeSettings({ ...settings }),
    getAccounts: () => client.loadAccounts(),
    getRowExtras: () => client.loadRowExtras(),
  };
}

// A price list with a non-positive or fractional amount saves nothing.
async function saveValidPrices(client: BusinessClient, prices: PriceItem[]): Promise<Business | null> {
  if (!prices.every((price) => isValidPrice(price.amount))) return null;

  return client.storePrices(structuredClone(prices));
}

// A fee list with a fee left without a name or at $0 saves nothing.
async function saveCompleteFees(client: BusinessClient, fees: FeeInput[]): Promise<Business | null> {
  if (!fees.every(isCompleteFee)) return null;

  return client.storeFees(structuredClone(fees));
}

// Module-level demo service shared by the default deps of useBusiness,
// usePrices and useSettings: saved prices and toggles survive navigation
// between the three screens (each hook built its own client before, so edits
// were lost on every screen change). Tests keep building their own service.
export const demoBusinessService: BusinessService = createBusinessService(createFakeBusinessClient());

// In-memory client seeded with a private copy of the demo business, its
// accounts and the feature-local demo values; the shared mock is never touched.
export function createFakeBusinessClient(): BusinessClient {
  let business = structuredClone(seedBusiness);
  let settings: BusinessSettings = {
    takingRequests: seedBusiness.takingRequests,
    urgentRequests: true,
    ringOnSilentAtNight: true,
    polishByDefault: false,
  };
  const accounts = structuredClone(seedAccounts);
  const demo = structuredClone(BUSINESS_DEMO);

  return {
    loadBusiness: async () => structuredClone(business),
    storePrices: async (prices) => {
      business = { ...business, prices: structuredClone(prices) };
      return structuredClone(business);
    },
    storeFees: async (fees) => {
      business = { ...business, fees: withSavedFees(business.fees, fees) };
      return structuredClone(business);
    },
    loadSettings: async () => ({ ...settings }),
    storeSettings: async (next) => {
      settings = { ...next };
      return { ...settings };
    },
    loadAccounts: async () => structuredClone(accounts),
    loadRowExtras: async () => ({ ...demo }),
  };
}
