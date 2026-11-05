// Spec: odd/tasks/live-owner-core.md T2 (S3, S7). Without the live API the Requests tab
// lists the demo offers from the fake client: Ana waiting, the three earlier ones answered.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { offers as mockOffers } from "../../../shared/data/mock.ts";
import { createFakeOffersClient, createOffersService } from "./offersService.ts";

describe("offersService.listOffers (demo)", () => {
  it("lists the mock offers newest first", async () => {
    const service = createOffersService(createFakeOffersClient());

    const offers = await service.listOffers();

    assert.deepEqual(
      offers.map((offer) => [offer.id, offer.status]),
      [
        ["req_ana", "offered"],
        ["req_carlos", "accepted"],
        ["req_grace", "expired"],
        ["req_tom", "declined"],
      ],
    );
    assert.deepEqual(offers[0], mockOffers[0]);
  });

  it("still accepts the demo offer and opens its demo chat", async () => {
    const service = createOffersService(createFakeOffersClient());

    assert.equal((await service.accept("req_ana"))?.status, "accepted");
    assert.equal(await service.findChat("req_ana"), "c_ana");
    assert.equal((await service.listOffers())[0]?.status, "accepted");
  });
});
