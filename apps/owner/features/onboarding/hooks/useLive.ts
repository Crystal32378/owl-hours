// Live: the business name, category and radius the earlier steps saved.
import { useEffect, useState } from "react";
import type { OnboardingService } from "../services/onboardingService.ts";
import { useOnboardingService } from "./useOnboardingService.ts";

export type LiveDeps = { service: OnboardingService };

export type LiveView = { businessName: string; category: string; radiusKm: number };

export type Live =
  | { status: "loading" }
  | { status: "failed"; retry: () => Promise<void> }
  | { status: "ready"; view: LiveView };

export function useLive(deps?: Partial<LiveDeps>): Live {
  const configured = useOnboardingService();
  const service = deps?.service ?? configured;

  const [view, setView] = useState<LiveView | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let isCurrent = true;
    setFailed(false);
    Promise.all([service.getProfile(), service.getArea()]).then(
      ([profile, area]) => {
        if (!isCurrent) return;
        setView({ businessName: profile.name, category: profile.category, radiusKm: area.radiusKm });
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
  if (view === null) return { status: "loading" };

  return { status: "ready", view };

  async function relaunch(): Promise<void> {
    setAttempt((count) => count + 1);
  }
}
