// The business location on the area step. A new live business sits at the (0, 0)
// placeholder, where no customer is ever matched, so Finish waits until the device
// location is saved; the demo business comes with its location preset.
import { onboardingCopys } from "../copys/onboardingCopys.ts";

export type LocationStatus = "missing" | "saved" | "preset";
export type LocationNotice = "denied" | "unavailable" | null;
export type LocationState = { status: LocationStatus; notice: LocationNotice };

export type GeoPoint = { lat: number; lng: number };

// The point a new live business is created at; it is never a real location.
export const PLACEHOLDER_POINT: Readonly<GeoPoint> = { lat: 0, lng: 0 };
export type DeviceFix = { kind: "found"; point: GeoPoint } | { kind: "denied" } | { kind: "unavailable" };

// The two expo-location calls the step needs, injected by the native route.
export type LocationPort = {
  requestPermission(): Promise<{ granted: boolean }>;
  currentPosition(): Promise<{ coords: { latitude: number; longitude: number } }>;
};

export function canFinishArea(status: LocationStatus): boolean {
  return status !== "missing";
}

export function offersLocationAction(status: LocationStatus): boolean {
  return status !== "preset";
}

// A device indoors or with location off may never answer; the owner gets a message instead.
const POSITION_TIMEOUT_MS = 15_000;

export async function locateDevice(port: LocationPort, timeoutMs = POSITION_TIMEOUT_MS): Promise<DeviceFix> {
  try {
    if (!(await port.requestPermission()).granted) return { kind: "denied" };
    const { coords } = await withinTime(port.currentPosition(), timeoutMs);
    return { kind: "found", point: { lat: coords.latitude, lng: coords.longitude } };
  } catch {
    return { kind: "unavailable" };
  }
}

// A found point is saved; anything else keeps the location the business already had.
export async function settleLocation(
  current: LocationStatus,
  fix: DeviceFix,
  save: (point: GeoPoint) => Promise<void>,
): Promise<LocationState> {
  if (fix.kind !== "found") return { status: current, notice: fix.kind };
  try {
    await save(fix.point);
    return { status: "saved", notice: null };
  } catch {
    return { status: current, notice: "unavailable" };
  }
}

export function locationMessage(state: LocationState): string | null {
  if (state.notice === "denied") return onboardingCopys.locationDenied;
  if (state.notice === "unavailable") return onboardingCopys.locationUnavailable;
  return STATUS_MESSAGES[state.status];
}

const STATUS_MESSAGES: Record<LocationStatus, string | null> = {
  missing: onboardingCopys.locationNeeded,
  saved: onboardingCopys.locationSaved,
  preset: null,
};

function withinTime<T>(work: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("location timed out")), timeoutMs);
  });
  return Promise.race([work, timeout]).finally(() => clearTimeout(timer));
}
