// Regression: price rows render the OwPricesSetup.dc.html layouts from demo data.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { business } from "../../../shared/data/mock.ts";
import { priceAmountText, pricesLead, radiusText } from "./priceText.ts";

describe("priceAmountText", () => {
  it("renders flat and from-prices", () => {
    assert.equal(priceAmountText({ amount: 45, from: false }), "$45");
    assert.equal(priceAmountText({ amount: 60, from: true }), "from $60");
  });

  it("renders every demo price without inventing copy", () => {
    assert.deepEqual(business.prices.map(priceAmountText), ["$45", "from $60", "from $80", "from $350"]);
  });
});

describe("radiusText", () => {
  it("renders the radius with its unit", () => {
    assert.equal(radiusText(5), "5 km");
  });
});

// Spec: odd/tasks/owner-area-map-fees-dark.md, T1, S3. The owl only claims a website
// import when there are prices to show; live onboarding imports nothing.
describe("pricesLead", () => {
  it("S3 says the prices came from the website when there are prices", () => {
    assert.equal(pricesLead(business.prices), "I found these on your website. Check them before customers see them.");
  });

  it("S3 asks for prices without claiming an import when nothing was imported", () => {
    assert.equal(pricesLead([]), "Add your prices so customers know what you charge.");
  });
});
