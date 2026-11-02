// Where the area step's map looks. The map itself is the shared service-area map
// (shared/map); this step only decides between the business point and the overview.
import { PLACEHOLDER_POINT } from "./areaLocation.ts";
import type { GeoPoint, LocationStatus } from "./areaLocation.ts";

// The point the map centres on, or null for the overview: a missing location, or the
// placeholder a new live business sits at until its location is saved.
export function mapCenter(status: LocationStatus, center: GeoPoint): GeoPoint | null {
  if (status === "missing" || isPlaceholder(center)) return null;
  return center;
}

function isPlaceholder(point: GeoPoint): boolean {
  return point.lat === PLACEHOLDER_POINT.lat && point.lng === PLACEHOLDER_POINT.lng;
}
