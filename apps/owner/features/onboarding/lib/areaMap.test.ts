// Spec: odd/tasks/owner-area-map-fees-dark.md, T1, S1 + S3. The area map is a MapLibre
// map on OpenFreeMap styles: centred on the business with its radius drawn as a circle,
// a neutral overview while the business has no real location, the dragged pin read
// back as a point, and the dark style in dark mode.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { circleBounds, mapCenter, mapStyleUrl, radiusCircle, toGeoPoint } from "./areaMap.ts";

// One degree of latitude on the mean Earth radius (6371.0088 km) is 111.195 km.
const TEN_KM_IN_DEGREES = 0.08993;
const CANCUN = { lat: 21.16, lng: -86.85 };

function assertClose(actual: number, expected: number, label: string): void {
  assert.ok(Math.abs(actual - expected) < 1e-4, `${label}: ${actual} is not ${expected}`);
}

describe("mapCenter", () => {
  it("S1 centres on a saved business location", () => {
    assert.deepEqual(mapCenter("saved", CANCUN), CANCUN);
  });

  it("S1 centres on a preset business location", () => {
    assert.deepEqual(mapCenter("preset", CANCUN), CANCUN);
  });

  it("S1 shows the overview while the location is still missing", () => {
    assert.equal(mapCenter("missing", CANCUN), null);
  });

  it("S1 shows the overview for the (0, 0) placeholder a new business starts at", () => {
    assert.equal(mapCenter("saved", { lat: 0, lng: 0 }), null);
  });
});

describe("radiusCircle", () => {
  it("S1 draws a closed ring of 64 sides around the centre", () => {
    const ring = radiusCircle(CANCUN, 10).geometry.coordinates[0];

    assert.equal(ring.length, 65);
    assert.deepEqual(ring[0], ring[64]);
  });

  it("S1 reaches the radius north of the centre", () => {
    const [lng, lat] = radiusCircle({ lat: 0, lng: 0 }, 10).geometry.coordinates[0][0];

    assertClose(lng, 0, "lng");
    assertClose(lat, TEN_KM_IN_DEGREES, "lat");
  });

  it("S1 widens in longitude away from the equator (cos 60° = 0.5)", () => {
    const [lng, lat] = radiusCircle({ lat: 60, lng: 10 }, 10).geometry.coordinates[0][16];

    assertClose(lng, 10 + 2 * TEN_KM_IN_DEGREES, "lng");
    assertClose(lat, 60, "lat");
  });
});

describe("circleBounds", () => {
  it("S1 frames the whole radius as [[west, south], [east, north]]", () => {
    const [[west, south], [east, north]] = circleBounds({ lat: 0, lng: 0 }, 10);

    assertClose(west, -TEN_KM_IN_DEGREES, "west");
    assertClose(south, -TEN_KM_IN_DEGREES, "south");
    assertClose(east, TEN_KM_IN_DEGREES, "east");
    assertClose(north, TEN_KM_IN_DEGREES, "north");
  });
});

describe("toGeoPoint", () => {
  it("S1 reads the dragged pin as the business point", () => {
    assert.deepEqual(toGeoPoint({ lng: -86.85, lat: 21.16 }), CANCUN);
  });

  it("S1 wraps a pin dragged across the antimeridian back into -180..180", () => {
    assert.deepEqual(toGeoPoint({ lng: 190, lat: 10 }), { lat: 10, lng: -170 });
  });
});

describe("mapStyleUrl", () => {
  it("S1 uses the OpenFreeMap Liberty style in light mode", () => {
    assert.equal(mapStyleUrl(false), "https://tiles.openfreemap.org/styles/liberty");
  });

  it("S3 uses the OpenFreeMap Dark style in dark mode", () => {
    assert.equal(mapStyleUrl(true), "https://tiles.openfreemap.org/styles/dark");
  });
});
