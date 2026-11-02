// The map credit shows first, then collapses to MapLibre's (i) button: OSMF allows collapsing
// "automatically after five seconds" or on map interaction, never starting hidden.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { ATTRIBUTION_VISIBLE_MS, collapseAttribution } from "./attribution.ts";

function fakeRoot(classes: string[] | null) {
  const list = new Set(classes ?? []);
  const control = classes === null ? null : { classList: { remove: (name: string) => list.delete(name) } };
  return { root: { querySelector: () => control }, list };
}

describe("collapseAttribution", () => {
  it("collapses the shown compact credit to its (i) button", () => {
    const { root, list } = fakeRoot(["maplibregl-ctrl-attrib", "maplibregl-compact", "maplibregl-compact-show"]);

    collapseAttribution(root);

    assert.equal(list.has("maplibregl-compact-show"), false);
    assert.equal(list.has("maplibregl-compact"), true);
  });

  it("does nothing when the map has no credit control", () => {
    const { root } = fakeRoot(null);

    assert.doesNotThrow(() => collapseAttribution(root));
  });

  it("keeps the credit visible for the five seconds the guidelines allow", () => {
    assert.equal(ATTRIBUTION_VISIBLE_MS, 5000);
  });
});
