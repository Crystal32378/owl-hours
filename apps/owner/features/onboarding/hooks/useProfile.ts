// Setup step 1 (business): the saved profile draft, the website import check,
// and the save that moves the flow to prices.
import { useEffect, useState } from "react";
import type {
  OnboardingProfile,
  OnboardingService,
  WebsiteImport,
} from "../services/onboardingService.ts";
import { useOnboardingService } from "./useOnboardingService.ts";

// Re-exported so screens type their props from the hook, never from the service module.
export type { OnboardingProfile, WebsiteImport } from "../services/onboardingService.ts";

export type ProfileDeps = { service: OnboardingService };

export type ProfileView = {
  profile: OnboardingProfile;
  importFromWebsite: (website: string) => Promise<WebsiteImport>;
  saveProfile: (profile: OnboardingProfile) => Promise<void>;
};

export type Profile =
  | { status: "loading" }
  | { status: "failed"; retry: () => Promise<void> }
  | { status: "ready"; view: ProfileView };

export function useProfile(deps?: Partial<ProfileDeps>): Profile {
  const configured = useOnboardingService();
  const service = deps?.service ?? configured;

  const [profile, setProfile] = useState<OnboardingProfile | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let isCurrent = true;
    setFailed(false);
    service.getProfile().then(
      (loaded) => {
        if (isCurrent) setProfile(loaded);
      },
      () => {
        if (isCurrent) setFailed(true);
      },
    );
    return () => {
      isCurrent = false;
    };
  }, [service, attempt]);

  if (failed) return { status: "failed", retry: relaunch };
  if (profile === null) return { status: "loading" };

  return {
    status: "ready",
    view: {
      profile,
      importFromWebsite: (website) => importAndStorePrices(service, website),
      saveProfile: (next) => service.saveProfile(next),
    },
  };

  async function relaunch(): Promise<void> {
    setAttempt((count) => count + 1);
  }
}

// The imported prices are saved so the prices step starts from them. An import that
// found nothing (live mode has no importer) leaves the business's own prices alone.
async function importAndStorePrices(
  service: OnboardingService,
  website: string,
): Promise<WebsiteImport> {
  const imported = await service.importFromWebsite(website);
  if (imported.prices.length > 0) await service.savePrices(imported.prices);
  return imported;
}
