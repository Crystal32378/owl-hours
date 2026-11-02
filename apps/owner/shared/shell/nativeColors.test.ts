// Regression: the tab bar and loading skeleton stayed white in dark mode, because the native
// tokens only had the light palette. The dark values mirror Astryx Neutral's light-dark() pairs.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { nativeColors } from "./native-tokens.ts";

describe("nativeColors", () => {
  it("keeps the light palette for light mode and when the scheme is unknown", () => {
    assert.equal(nativeColors("light").bgCard, "#ffffff");
    assert.equal(nativeColors(null).bgCard, "#ffffff");
    assert.equal(nativeColors(undefined).text, "#000000");
  });

  it("uses Astryx Neutral's dark values in dark mode, keeping the Zukki blue", () => {
    const dark = nativeColors("dark");

    assert.equal(dark.bgBody, "#1b1b1b");
    assert.equal(dark.bgCard, "#1b1b1b");
    assert.equal(dark.text, "#ffffff");
    assert.equal(dark.iconSecondary, "#9e9e9e");
    assert.equal(dark.border, "#ffffff1A");
    assert.equal(dark.accent, "#0074e2");
  });
});
