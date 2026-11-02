// Spec: odd/tasks/owner-business.md S3, S4: prices round-trip through the fake
// adapter; an invalid price saves nothing; each settings switch round-trips.
// Every test builds its own service so state never leaks between tests.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { business as mockBusiness } from "../../../shared/data/mock.ts";
import type { PriceItem } from "../../../shared/data/types.ts";
import { createBusinessService, createFakeBusinessClient } from "./businessService.ts";
import { hoursSummary } from "../lib/hoursSummary.ts";
import type { BusinessSettings } from "./businessService.ts";

function buildService() {
  return createBusinessService(createFakeBusinessClient());
}

function changedPrices(firstAmount: number): PriceItem[] {
  const prices = structuredClone(mockBusiness.prices);
  prices[0] = { ...prices[0], amount: firstAmount };
  return prices;
}

describe("businessService.getBusiness", () => {
  it("returns Northside Plumbing from the demo data", async () => {
    const found = await buildService().getBusiness();

    assert.equal(found.name, "Northside Plumbing");
    assert.equal(found.id, "biz_northside");
  });
});

describe("businessService.savePrices", () => {
  it("round-trips saved prices: a read after save returns them", async () => {
    const service = buildService();
    const updated = changedPrices(50);

    const saved = await service.savePrices(updated);

    assert.notEqual(saved, null);
    assert.deepEqual((await service.getBusiness()).prices, updated);
  });

  for (const amount of [0, -10, 4.5, NaN]) {
    it(`saving a price of ${amount} returns null and changes nothing`, async () => {
      const service = buildService();
      const before = (await service.getBusiness()).prices;

      assert.equal(await service.savePrices(changedPrices(amount)), null);
      assert.deepEqual((await service.getBusiness()).prices, before);
    });
  }
});

describe("businessService.saveFees", () => {
  it("round-trips the demo fees: edited, added and removed fees read back, parts at cost stays", async () => {
    const service = buildService();
    const edited = [
      { id: "f1", label: "Late night", amount: 30, atNight: true },
      { id: "f-new-1", label: "Holiday", amount: 20, atNight: false },
    ];

    const saved = await service.saveFees(edited);

    const expected = [
      { id: "f1", label: "Late night", amount: 30, atNight: true, window: "10 PM–7 AM" },
      { id: "f-new-1", label: "Holiday", amount: 20, atNight: false },
      { id: "f3", label: "Parts", amount: "at_cost" },
    ];
    assert.deepEqual(saved?.fees, expected);
    assert.deepEqual((await service.getBusiness()).fees, expected);
  });

  it("saves nothing for a fee without a name or at $0", async () => {
    const service = buildService();

    assert.equal(await service.saveFees([{ id: "f1", label: "", amount: 25, atNight: true }]), null);
    assert.equal(await service.saveFees([{ id: "f1", label: "Night", amount: 0, atNight: true }]), null);
    assert.deepEqual((await service.getBusiness()).fees, mockBusiness.fees);
  });
});

describe("businessService settings", () => {
  it("starts as the OwSettings design shows: on, on, on, off", async () => {
    assert.deepEqual(await buildService().getSettings(), {
      takingRequests: true,
      urgentRequests: true,
      ringOnSilentAtNight: true,
      polishByDefault: false,
    });
  });

  const settingKeys = ["takingRequests", "urgentRequests", "ringOnSilentAtNight", "polishByDefault"] as const;

  for (const key of settingKeys) {
    it(`toggling ${key} round-trips`, async () => {
      const service = buildService();
      const current: BusinessSettings = await service.getSettings();
      const flipped = { ...current, [key]: !current[key] };

      assert.deepEqual(await service.saveSettings(flipped), flipped);
      assert.deepEqual(await service.getSettings(), flipped);
    });
  }
});

describe("businessService isolation", () => {
  it("does not mutate the shared mock", async () => {
    const snapshot = structuredClone(mockBusiness);
    const service = buildService();

    await service.savePrices(changedPrices(50));
    await service.saveSettings({ ...(await service.getSettings()), takingRequests: false });
    await service.savePrices(changedPrices(0));

    assert.deepEqual(mockBusiness, snapshot);
  });
});

describe("businessService hours", () => {
  it("round-trips saved hours and updates the Hours row summary", async () => {
    const service = createBusinessService(createFakeBusinessClient());
    const hours = [{ weekday: 2, opens: "20:00", closes: "06:00" }];

    assert.deepEqual(await service.saveHours(hours), hours);

    assert.deepEqual(await service.getHours(), hours);
    assert.equal((await service.getBusiness()).hours.summary, "Tue, 8 PM–6 AM");
  });

  it("saves nothing when a shift opens and closes at the same time", async () => {
    const service = createBusinessService(createFakeBusinessClient());
    const before = await service.getHours();

    assert.equal(await service.saveHours([{ weekday: 2, opens: "09:00", closes: "09:00" }]), null);

    assert.deepEqual(await service.getHours(), before);
  });

  it("starts the demo at the hours its summary reads", async () => {
    const service = createBusinessService(createFakeBusinessClient());

    assert.equal(hoursSummary(await service.getHours()), (await service.getBusiness()).hours.summary);
  });
});
