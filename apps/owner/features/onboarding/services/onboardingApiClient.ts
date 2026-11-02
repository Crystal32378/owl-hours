// The live onboarding steps on the owner API (docs/API.md): the business step creates
// or updates the caller's business (POST /business), prices, fees and area replace the
// business's own (PUT /business/prices, PUT /business/fees, PUT /business/area), the
// night switch is PATCH /business, and fees, the hours summary and whether the
// business has a real location are read from GET /business. The device location is saved as the area centre.
// The owner name and the emailed address stay in the given drafts.
import type { Business } from "../../../shared/data/types.ts";
import { OwnerApiError } from "../../../shared/infra/ownerApi.ts";
import type { OwnerEditApi } from "../../../shared/infra/ownerApi.ts";
import { createBusinessApiClient, readHasLocation } from "../../business/services/businessApiClient.ts";
import { PLACEHOLDER_POINT } from "../lib/areaLocation.ts";
import type { GeoPoint, LocationStatus } from "../lib/areaLocation.ts";
import { DEFAULT_RADIUS_KM } from "../lib/areaRadius.ts";
import type { OnboardingClient, OnboardingProfile } from "./onboardingService.ts";

type StepArea = { radiusKm: number; nightUrgent: boolean };

const NO_PROFILE: OnboardingProfile = { name: "", category: "", website: "" };

// apps/api has no website importer, so live onboarding imports nothing.
const NOTHING_IMPORTED = { services: 0, prices: [] };

export function createApiOnboardingClient(api: OwnerEditApi, drafts: OnboardingClient): OnboardingClient {
  const business = createBusinessApiClient(api);

  function findBusiness(): Promise<Business | null> {
    return nullWithoutBusiness(business.loadBusiness());
  }

  async function findLocationStatus(): Promise<LocationStatus> {
    return (await nullWithoutBusiness(readHasLocation(api))) ? "saved" : "missing";
  }

  async function saveLocation(point: GeoPoint, radiusKm: number): Promise<void> {
    await api.put("/business/area", { ...point, radiusKm });
  }

  async function saveProfile(profile: OnboardingProfile): Promise<void> {
    const ownerName = (await drafts.findOwnerName())?.trim();
    const website = withScheme(profile.website);
    await api.post("/business", { name: profile.name, category: profile.category, website, ...(ownerName ? { ownerName } : {}) });
  }

  async function saveArea(area: StepArea): Promise<void> {
    const saved = await business.loadBusiness();
    if (!hasArea(saved) || saved.area.radiusKm !== area.radiusKm) {
      await api.put("/business/area", { ...saved.area.center, radiusKm: area.radiusKm });
    }
    if (saved.hours.nightUrgent !== area.nightUrgent) {
      await api.patch("/business", { nightJobs: area.nightUrgent });
    }
  }

  return {
    ...drafts,
    importPrices: async () => structuredClone(NOTHING_IMPORTED),
    findProfile: async () => toProfile(await findBusiness()),
    saveProfile,
    findPrices: async () => (await findBusiness())?.prices ?? [],
    savePrices: async (prices) => {
      await business.storePrices(prices);
    },
    findArea: async () => toStepArea(await findBusiness()),
    saveArea,
    findLocationStatus,
    findCenter: async () => (await findBusiness())?.area.center ?? { ...PLACEHOLDER_POINT },
    saveLocation,
    findFees: async () => (await findBusiness())?.fees ?? [],
    saveFees: async (fees) => {
      await business.storeFees(fees);
    },
    findHoursSummary: async () => (await findBusiness())?.hours.summary ?? "",
  };
}

// GET /business answers 404 until the business step has created the business.
async function nullWithoutBusiness<T>(read: Promise<T>): Promise<T | null> {
  try {
    return await read;
  } catch (error) {
    if (error instanceof OwnerApiError && error.status === 404) return null;
    throw error;
  }
}

function toProfile(business: Business | null): OnboardingProfile {
  if (!business) return NO_PROFILE;
  return { name: business.name, category: business.category, website: business.website ?? "" };
}

// A business without a service area starts the slider at the default radius.
function toStepArea(business: Business | null): StepArea | null {
  if (!business) return null;
  const radiusKm = hasArea(business) ? business.area.radiusKm : DEFAULT_RADIUS_KM;
  return { radiusKm, nightUrgent: business.hours.nightUrgent };
}

// The live business client reads a missing area as a zero radius around (0, 0),
// which is also the placeholder point a new business's first area is drawn around.
function hasArea(business: Business): boolean {
  return business.area.radiusKm > 0;
}

// The owner types "eastside.example"; the API stores websites with their scheme.
function withScheme(website: string): string {
  const typed = website.trim();
  if (typed === "" || /^https?:\/\//i.test(typed)) return typed;
  return `https://${typed}`;
}
