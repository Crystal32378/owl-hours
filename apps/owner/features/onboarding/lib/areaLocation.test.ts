// Spec: odd/tasks/owner-device-location.md, T2, S3-S4. The area step asks the device
// for its location in live mode; Finish waits for a real business location, and a
// denied permission keeps the step with a short message. The demo business has one preset.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { onboardingCopys } from "../copys/onboardingCopys.ts";
import {
  canFinishArea,
  locateDevice,
  locationMessage,
  offersLocationAction,
  settleLocation,
  type DeviceFix,
  type LocationPort,
} from "./areaLocation.ts";

const POSITION = { coords: { latitude: 20.97, longitude: -89.62 } };
const FOUND: DeviceFix = { kind: "found", point: { lat: 20.97, lng: -89.62 } };

function port(answers: { granted: boolean; position?: () => Promise<typeof POSITION> }) {
  const asked: string[] = [];
  const device: LocationPort = {
    requestPermission: async () => {
      asked.push("permission");
      return { granted: answers.granted };
    },
    currentPosition: async () => {
      asked.push("position");
      return (answers.position ?? (async () => POSITION))();
    },
  };
  return { device, asked };
}

describe("canFinishArea", () => {
  it("S3 waits while the business has no real location", () => {
    assert.equal(canFinishArea("missing"), false);
  });

  it("S4 lets a business with a saved location finish", () => {
    assert.equal(canFinishArea("saved"), true);
  });

  it("S3 lets the demo finish as before", () => {
    assert.equal(canFinishArea("preset"), true);
  });
});

describe("offersLocationAction", () => {
  it("S3 offers the action in live mode, with or without a saved location", () => {
    assert.equal(offersLocationAction("missing"), true);
    assert.equal(offersLocationAction("saved"), true);
  });

  it("S3 never offers it in demo mode", () => {
    assert.equal(offersLocationAction("preset"), false);
  });
});

describe("locateDevice", () => {
  it("S3 reads the current position once the permission is granted", async () => {
    const { device, asked } = port({ granted: true });

    assert.deepEqual(await locateDevice(device), FOUND);
    assert.deepEqual(asked, ["permission", "position"]);
  });

  it("S3 a denied permission never reads the position", async () => {
    const { device, asked } = port({ granted: false });

    assert.deepEqual(await locateDevice(device), { kind: "denied" });
    assert.deepEqual(asked, ["permission"]);
  });

  it("S3 a position the device cannot get is unavailable", async () => {
    const { device } = port({ granted: true, position: () => Promise.reject(new Error("location off")) });

    assert.deepEqual(await locateDevice(device), { kind: "unavailable" });
  });

  it("S3 a position that never arrives stops waiting and is unavailable", async () => {
    const { device } = port({ granted: true, position: () => new Promise(() => {}) });

    assert.deepEqual(await locateDevice(device, 10), { kind: "unavailable" });
  });
});

describe("settleLocation", () => {
  it("S3 saves a found point and marks the location saved", async () => {
    const saved: unknown[] = [];

    const next = await settleLocation("missing", FOUND, async (point) => {
      saved.push(point);
    });

    assert.deepEqual(next, { status: "saved", notice: null });
    assert.deepEqual(saved, [{ lat: 20.97, lng: -89.62 }]);
  });

  it("S3 a denied permission keeps the step and saves nothing", async () => {
    const saved: unknown[] = [];

    const next = await settleLocation("missing", { kind: "denied" }, async (point) => {
      saved.push(point);
    });

    assert.deepEqual(next, { status: "missing", notice: "denied" });
    assert.deepEqual(saved, []);
  });

  it("S4 a failed save keeps the location the business already had", async () => {
    const next = await settleLocation("saved", FOUND, () => Promise.reject(new Error("offline")));

    assert.deepEqual(next, { status: "saved", notice: "unavailable" });
  });
});

describe("locationMessage", () => {
  it("S3 asks for the location while it is missing", () => {
    assert.equal(locationMessage({ status: "missing", notice: null }), onboardingCopys.locationNeeded);
  });

  it("S3 confirms a saved location", () => {
    assert.equal(locationMessage({ status: "saved", notice: null }), onboardingCopys.locationSaved);
  });

  it("S3 says the permission was denied", () => {
    assert.equal(locationMessage({ status: "missing", notice: "denied" }), onboardingCopys.locationDenied);
  });

  it("S3 says the location could not be read or saved", () => {
    assert.equal(locationMessage({ status: "saved", notice: "unavailable" }), onboardingCopys.locationUnavailable);
  });

  it("S3 shows nothing in demo mode", () => {
    assert.equal(locationMessage({ status: "preset", notice: null }), null);
  });
});
