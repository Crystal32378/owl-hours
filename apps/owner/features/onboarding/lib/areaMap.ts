// The service-area map: where it looks, the radius circle it draws, and the vector
// style it uses. OpenFreeMap serves the styles without an API key
// (https://openfreemap.org/quick_start/); the map itself is MapLibre GL JS.
import { PLACEHOLDER_POINT } from "./areaLocation.ts";
import type { GeoPoint, LocationStatus } from "./areaLocation.ts";

export type LngLatPair = [lng: number, lat: number];
export type CircleFeature = {
  type: "Feature";
  properties: Record<string, never>;
  geometry: { type: "Polygon"; coordinates: LngLatPair[][] };
};

// A world view for a business that has no real location yet.
export const OVERVIEW_CAMERA = { center: [0, 20] as LngLatPair, zoom: 0.5 };

const LIGHT_STYLE_URL = "https://tiles.openfreemap.org/styles/liberty";
const DARK_STYLE_URL = "https://tiles.openfreemap.org/styles/dark";

const EARTH_RADIUS_KM = 6371.0088;
const CIRCLE_SIDES = 64;

// The point the map centres on, or null for the overview: a missing location, or the
// placeholder a new live business sits at until its location is saved.
export function mapCenter(status: LocationStatus, center: GeoPoint): GeoPoint | null {
  if (status === "missing" || isPlaceholder(center)) return null;
  return center;
}

export function radiusCircle(center: GeoPoint, radiusKm: number): CircleFeature {
  const ring = Array.from({ length: CIRCLE_SIDES }, (_, side) => pointAtBearing(center, radiusKm, (side / CIRCLE_SIDES) * 360));
  return {
    type: "Feature",
    properties: {},
    geometry: { type: "Polygon", coordinates: [[...ring, ring[0]]] },
  };
}

export function circleBounds(center: GeoPoint, radiusKm: number): [LngLatPair, LngLatPair] {
  const latSpan = degreesOfLatitude(radiusKm);
  const lngSpan = degreesOfLongitude(radiusKm, center.lat);
  return [
    [center.lng - lngSpan, center.lat - latSpan],
    [center.lng + lngSpan, center.lat + latSpan],
  ];
}

// A marker dragged past the antimeridian reports a longitude outside -180..180.
export function toGeoPoint(lngLat: { lng: number; lat: number }): GeoPoint {
  return { lat: lngLat.lat, lng: wrapLongitude(lngLat.lng) };
}

export function mapStyleUrl(isDark: boolean): string {
  return isDark ? DARK_STYLE_URL : LIGHT_STYLE_URL;
}

function isPlaceholder(point: GeoPoint): boolean {
  return point.lat === PLACEHOLDER_POINT.lat && point.lng === PLACEHOLDER_POINT.lng;
}

// Equirectangular offset: exact enough for a radius of at most 20 km.
function pointAtBearing(center: GeoPoint, radiusKm: number, bearingDegrees: number): LngLatPair {
  const bearing = toRadians(bearingDegrees);
  return [
    center.lng + degreesOfLongitude(radiusKm, center.lat) * Math.sin(bearing),
    center.lat + degreesOfLatitude(radiusKm) * Math.cos(bearing),
  ];
}

function degreesOfLatitude(km: number): number {
  return toDegrees(km / EARTH_RADIUS_KM);
}

function degreesOfLongitude(km: number, latitude: number): number {
  return degreesOfLatitude(km) / Math.cos(toRadians(latitude));
}

// In-range longitudes pass through untouched: the modulo would add float drift.
function wrapLongitude(lng: number): number {
  if (lng >= -180 && lng <= 180) return lng;
  return ((((lng + 180) % 360) + 360) % 360) - 180;
}

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

function toDegrees(radians: number): number {
  return (radians * 180) / Math.PI;
}
