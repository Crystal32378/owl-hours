// Service-area radius: the slider runs 1-20 km and starts at 5 (OwAreaSetup.dc.html,
// min="1" max="20" value="5"). The live client loads this module, so it reads no demo data.
export const MIN_RADIUS_KM = 1;
export const MAX_RADIUS_KM = 20;
export const DEFAULT_RADIUS_KM = 5;

export function clampRadiusKm(radiusKm: number): number {
  return Math.min(MAX_RADIUS_KM, Math.max(MIN_RADIUS_KM, radiusKm));
}
