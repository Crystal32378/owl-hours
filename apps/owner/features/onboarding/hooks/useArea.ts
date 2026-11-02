// Setup step 3 (hours and area): the saved radius and night switch, plus the finish
// that persists both and moves the flow to live. In live mode the step also saves
// the device location (located by the native route) as the business location; on the
// map the owner can drag the pin, and that point is saved the same way.
import { useEffect, useState } from "react";
import { settleLocation } from "../lib/areaLocation.ts";
import type { DeviceFix, GeoPoint, LocationState, LocationStatus } from "../lib/areaLocation.ts";
import { clampRadiusKm } from "../lib/areaRadius.ts";
import type { OnboardingService } from "../services/onboardingService.ts";
import { useOnboardingService } from "./useOnboardingService.ts";

export type AreaDeps = { service: OnboardingService };

export type LocateDevice = () => Promise<DeviceFix>;

export type AreaView = {
  radiusKm: number;
  nightUrgent: boolean;
  hoursSummary: string;
  location: LocationState;
  center: GeoPoint;
  isLocating: boolean; // a device fix or a dragged pin is being saved: Finish waits for it
  finish: (radiusKm: number, nightUrgent: boolean) => Promise<void>;
  saveDeviceLocation: (radiusKm: number) => Promise<void>;
  moveLocation: (point: GeoPoint, radiusKm: number) => Promise<void>;
};

export type Area =
  | { status: "loading" }
  | { status: "failed"; retry: () => Promise<void> }
  | { status: "ready"; view: AreaView };

export function useArea(locate: LocateDevice, deps?: Partial<AreaDeps>): Area {
  const configured = useOnboardingService();
  const service = deps?.service ?? configured;

  const [saved, setSaved] = useState<{
    radiusKm: number;
    nightUrgent: boolean;
    hoursSummary: string;
  } | null>(null);
  const [location, setLocation] = useState<LocationState | null>(null);
  const [center, setCenter] = useState<GeoPoint | null>(null);
  const [failed, setFailed] = useState(false);
  const [isLocating, setIsLocating] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let isCurrent = true;
    setFailed(false);
    Promise.all([
      service.getArea(),
      service.getNightUrgent(),
      service.getHoursSummary(),
      service.getLocationStatus(),
      service.getCenter(),
    ]).then(
      ([area, nightUrgent, hoursSummary, locationStatus, savedCenter]) => {
        if (!isCurrent) return;
        setSaved({ radiusKm: area.radiusKm, nightUrgent, hoursSummary });
        setLocation({ status: locationStatus, notice: null });
        setCenter(savedCenter);
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
  if (saved === null || location === null || center === null) return { status: "loading" };

  return {
    status: "ready",
    view: {
      radiusKm: saved.radiusKm,
      nightUrgent: saved.nightUrgent,
      hoursSummary: saved.hoursSummary,
      location,
      center,
      isLocating,
      finish: (radiusKm, nightUrgent) => finishArea(service, radiusKm, nightUrgent),
      saveDeviceLocation: (radiusKm) => whileLocating(async () => settle(location.status, await locate(), radiusKm)),
      moveLocation: (point, radiusKm) => whileLocating(() => settle(location.status, { kind: "found", point }, radiusKm)),
    },
  };

  async function whileLocating(work: () => Promise<void>): Promise<void> {
    if (isLocating) return;
    setIsLocating(true);
    try {
      await work();
    } finally {
      setIsLocating(false);
    }
  }

  async function settle(current: LocationStatus, fix: DeviceFix, radiusKm: number): Promise<void> {
    setLocation(await settleLocation(current, fix, (point) => saveCenter(point, radiusKm)));
  }

  async function saveCenter(point: GeoPoint, radiusKm: number): Promise<void> {
    await service.saveLocation(point, clampRadiusKm(radiusKm));
    setCenter(point);
  }

  async function relaunch(): Promise<void> {
    setAttempt((count) => count + 1);
  }
}

async function finishArea(
  service: OnboardingService,
  radiusKm: number,
  nightUrgent: boolean,
): Promise<void> {
  await service.saveArea({ radiusKm: clampRadiusKm(radiusKm) });
  await service.setNightUrgent(nightUrgent);
}
