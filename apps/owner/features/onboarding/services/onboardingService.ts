// Onboarding backend: sign-up code, website import, and the profile/prices/area steps.
// Demo mode checks DEMO_CODE; live mode emails and checks the code through CodeAuth
// (Supabase email OTP behind the owner auth controller). Demo drafts stay in memory;
// with the live owner API the steps save the business there (onboardingApiClient.ts).
// The fake client is seeded with private copies of the demo business and owner
// (structuredClone, never mutating the shared mock). Services return states
// (e.g. "wrong_code"), never copy: the screens own the words.
import {
  business as seedBusiness,
  owner as seedOwner,
} from "../../../shared/data/mock.ts";
import type { ExtraFee, PriceItem } from "../../../shared/data/types.ts";
import type { OwnerEditApi } from "../../../shared/infra/ownerApi.ts";
import type { GeoPoint, LocationStatus } from "../lib/areaLocation.ts";
import { createApiOnboardingClient } from "./onboardingApiClient.ts";

// Typed as string (not the literal): callers compare it against arbitrary user input,
// which is exactly what the locked verify test does with its wrong-code branch.
export const DEMO_CODE: string = "482910";
// The shared demo owner predates email sign-in and has no email,
// so the onboarding demo seed owns it.
export const DEMO_EMAIL = "daniel@northside-plumbing.example";
const IMPORTED_SERVICES = 12;

export type OnboardingProfile = { name: string; category: string; website: string };
export type OnboardingArea = { radiusKm: number };
export type WebsiteImport = { services: number; prices: PriceItem[] };

export type SendCodeResult = { ok: boolean };
export type VerifyCodeResult = { ok: true } | { ok: false; error: "wrong_code" };

export type OnboardingService = {
  sendCode(email: string): Promise<SendCodeResult>;
  verifyCode(email: string, code: string): Promise<VerifyCodeResult>;
  importFromWebsite(website: string): Promise<WebsiteImport>;
  getOwnerName(): Promise<string>;
  saveOwnerName(name: string): Promise<void>;
  getLastEmail(): Promise<{ email: string; sentAt: string }>;
  getProfile(): Promise<OnboardingProfile>;
  saveProfile(profile: OnboardingProfile): Promise<void>;
  getPrices(): Promise<PriceItem[]>;
  savePrices(prices: PriceItem[]): Promise<void>;
  getFees(): Promise<ExtraFee[]>;
  getArea(): Promise<OnboardingArea>;
  saveArea(area: OnboardingArea): Promise<void>;
  getLocationStatus(): Promise<LocationStatus>;
  getCenter(): Promise<GeoPoint>;
  saveLocation(point: GeoPoint, radiusKm: number): Promise<void>;
  getHoursSummary(): Promise<string>;
  getNightUrgent(): Promise<boolean>;
  setNightUrgent(nightUrgent: boolean): Promise<void>;
};

// Who sign-up starts with: the demo owner name and demo email in demo mode, empty fields in live.
export type OwnerDefaults = { name: string; email: string };

export type OnboardingDeps = { now: () => string; owner: OwnerDefaults };

export type CodeAuth = {
  sendCode(email: string): Promise<boolean>;
  verifyCode(email: string, code: string): Promise<boolean>;
};

export type OnboardingClient = {
  findOwnerName(): Promise<string | null>;
  saveOwnerName(name: string): Promise<void>;
  findEmail(): Promise<{ email: string; sentAt: string } | null>;
  saveEmail(entry: { email: string; sentAt: string }): Promise<void>;
  sendCode(email: string): Promise<boolean>;
  checkCode(email: string, code: string): Promise<boolean>;
  importPrices(): Promise<WebsiteImport>;
  findProfile(): Promise<OnboardingProfile | null>;
  saveProfile(profile: OnboardingProfile): Promise<void>;
  findPrices(): Promise<PriceItem[] | null>;
  savePrices(prices: PriceItem[]): Promise<void>;
  findArea(): Promise<{ radiusKm: number; nightUrgent: boolean } | null>;
  saveArea(area: { radiusKm: number; nightUrgent: boolean }): Promise<void>;
  findLocationStatus(): Promise<LocationStatus>;
  findCenter(): Promise<GeoPoint>;
  saveLocation(point: GeoPoint, radiusKm: number): Promise<void>;
  findFees(): Promise<ExtraFee[]>;
  findHoursSummary(): Promise<string>;
};

export function createOnboardingService(
  client: OnboardingClient,
  deps: Partial<OnboardingDeps> = {},
): OnboardingService {
  const { now, owner } = { ...createDefaultDeps(), ...deps };

  return {
    sendCode: (email) => sendCode(client, now, email),
    verifyCode: (email, code) => verifyCode(client, email, code),
    importFromWebsite: () => client.importPrices(),
    getOwnerName: async () => (await client.findOwnerName()) ?? owner.name,
    saveOwnerName: (name) => client.saveOwnerName(name),
    getLastEmail: () => lastEmail(client, owner.email),
    getProfile: () => currentProfile(client),
    saveProfile: (profile) => client.saveProfile(profile),
    getPrices: () => currentPrices(client),
    savePrices: (prices) => client.savePrices(prices),
    getFees: () => client.findFees(),
    getArea: () => currentArea(client),
    saveArea: (area) => keepNightUrgent(client, area),
    getLocationStatus: () => client.findLocationStatus(),
    getCenter: () => client.findCenter(),
    saveLocation: (point, radiusKm) => client.saveLocation(point, radiusKm),
    getHoursSummary: () => client.findHoursSummary(),
    getNightUrgent: async () => (await storedArea(client)).nightUrgent,
    setNightUrgent: (nightUrgent) => storeNightUrgent(client, nightUrgent),
  };
}

// In-memory client seeded with private copies of the demo owner, business, prices and area.
export function createFakeOnboardingClient(): OnboardingClient {
  let ownerName: string | null = null;
  let email: { email: string; sentAt: string } | null = null;
  let profile: OnboardingProfile | null = null;
  let prices: PriceItem[] | null = null;
  let area: { radiusKm: number; nightUrgent: boolean } | null = null;

  return {
    findOwnerName: async () => ownerName,
    saveOwnerName: async (name) => {
      ownerName = name;
    },
    findEmail: async () => structuredClone(email),
    saveEmail: async (entry) => {
      email = structuredClone(entry);
    },
    sendCode: async () => true,
    checkCode: async (_email, code) => code === DEMO_CODE,
    importPrices: async () => ({
      services: IMPORTED_SERVICES,
      prices: structuredClone(seedBusiness.prices),
    }),
    findProfile: async () => structuredClone(profile),
    saveProfile: async (next) => {
      profile = structuredClone(next);
    },
    findPrices: async () => structuredClone(prices),
    savePrices: async (next) => {
      prices = structuredClone(next);
    },
    findArea: async () => structuredClone(area),
    saveArea: async (next) => {
      area = structuredClone(next);
    },
    // The demo business has its location preset, so the area step never asks for one.
    findLocationStatus: async () => "preset",
    findCenter: async () => structuredClone(seedBusiness.area.center),
    saveLocation: async () => {},
    findFees: async () => structuredClone(seedBusiness.fees),
    findHoursSummary: async () => seedBusiness.hours.summary,
  };
}

// Live client: the code goes through CodeAuth; every draft stays in the given client.
export function createLiveOnboardingClient(
  codeAuth: CodeAuth,
  drafts: OnboardingClient,
): OnboardingClient {
  return {
    ...drafts,
    sendCode: (email) => codeAuth.sendCode(email),
    checkCode: (email, code) => codeAuth.verifyCode(email, code),
  };
}

// The drafts every hook shares, so data entered on one step is there on the next:
// profile -> prices -> area -> live shows the business name and radius.
const sharedDrafts = createFakeOnboardingClient();

export const demoOnboardingService: OnboardingService = createOnboardingService(sharedDrafts);

const liveServices = new WeakMap<CodeAuth, OnboardingService>();

// Demo mode (no CodeAuth) keeps the fake; live mode reuses one service per CodeAuth,
// so the address sent on sign-up is the one verify shows and checks. With the live
// owner API the business steps save there; without it they stay in the shared drafts.
export function onboardingServiceFor(
  codeAuth: CodeAuth | null,
  api: OwnerEditApi | null = null,
): OnboardingService {
  if (codeAuth === null) return demoOnboardingService;

  const known = liveServices.get(codeAuth);
  if (known) return known;

  const live = createLiveOnboardingService(codeAuth, api);
  liveServices.set(codeAuth, live);
  return live;
}

function createLiveOnboardingService(codeAuth: CodeAuth, api: OwnerEditApi | null): OnboardingService {
  const steps = api ? createApiOnboardingClient(api, sharedDrafts) : sharedDrafts;
  return createOnboardingService(createLiveOnboardingClient(codeAuth, steps), {
    owner: { name: "", email: "" },
  });
}

async function sendCode(
  client: OnboardingClient,
  now: () => string,
  email: string,
): Promise<SendCodeResult> {
  if (email.trim() === "") return { ok: false };
  if (!(await client.sendCode(email))) return { ok: false };

  await client.saveEmail({ email, sentAt: now() });
  return { ok: true };
}

// No prior send is required here: the locked demo tests verify without sending first.
async function verifyCode(
  client: OnboardingClient,
  email: string,
  code: string,
): Promise<VerifyCodeResult> {
  if (await client.checkCode(email, code)) return { ok: true };

  return { ok: false, error: "wrong_code" };
}

async function lastEmail(
  client: OnboardingClient,
  defaultEmail: string,
): Promise<{ email: string; sentAt: string }> {
  return (await client.findEmail()) ?? { email: defaultEmail, sentAt: new Date(0).toISOString() };
}

async function currentProfile(client: OnboardingClient): Promise<OnboardingProfile> {
  return (
    (await client.findProfile()) ?? {
      name: seedBusiness.name,
      category: seedBusiness.category,
      website: seedBusiness.website ?? "",
    }
  );
}

async function currentPrices(client: OnboardingClient): Promise<PriceItem[]> {
  return (await client.findPrices()) ?? structuredClone(seedBusiness.prices);
}

async function currentArea(client: OnboardingClient): Promise<OnboardingArea> {
  return { radiusKm: (await storedArea(client)).radiusKm };
}

async function storedArea(
  client: OnboardingClient,
): Promise<{ radiusKm: number; nightUrgent: boolean }> {
  return (
    (await client.findArea()) ?? {
      radiusKm: seedBusiness.area.radiusKm,
      nightUrgent: seedBusiness.hours.nightUrgent,
    }
  );
}

// saveArea keeps the exact { radiusKm } shape the area step owns; the night switch
// persists alongside it without leaking into that shape.
async function keepNightUrgent(
  client: OnboardingClient,
  area: OnboardingArea,
): Promise<void> {
  await client.saveArea({ ...area, nightUrgent: (await storedArea(client)).nightUrgent });
}

async function storeNightUrgent(client: OnboardingClient, nightUrgent: boolean): Promise<void> {
  await client.saveArea({ ...(await storedArea(client)), nightUrgent });
}

function createDefaultDeps(): OnboardingDeps {
  return {
    now: () => new Date().toISOString(),
    owner: { name: seedOwner.name, email: DEMO_EMAIL },
  };
}
