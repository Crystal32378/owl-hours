// Regression: Astryx's fonts.css loads Figtree with a CSS @import of Google Fonts, which Expo's DOM
// component export lists as a .css-external asset it never writes, so EAS Update cannot upload.
// The stylesheet is now linked at runtime instead, once per document.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { FIGTREE_STYLESHEET, addFigtreeStylesheet } from "./figtreeStylesheet.ts";

type FakeLink = { id: string; rel: string; href: string };

function fakeDocument() {
  const links: FakeLink[] = [];
  return {
    links,
    getElementById: (id: string) => links.find((link) => link.id === id) ?? null,
    createElement: () => ({ id: "", rel: "", href: "" }) as FakeLink,
    head: { appendChild: (link: FakeLink) => links.push(link) },
  };
}

describe("addFigtreeStylesheet", () => {
  it("links the Figtree stylesheet Astryx's fonts.css imported", () => {
    const doc = fakeDocument();

    addFigtreeStylesheet(doc);

    assert.deepEqual(doc.links.map(({ rel, href }) => ({ rel, href })), [{ rel: "stylesheet", href: FIGTREE_STYLESHEET }]);
    assert.match(FIGTREE_STYLESHEET, /^https:\/\/fonts\.googleapis\.com\/css2\?family=Figtree:wght@400;500;600;700/);
  });

  it("links it once however many screens load it", () => {
    const doc = fakeDocument();

    addFigtreeStylesheet(doc);
    addFigtreeStylesheet(doc);

    assert.equal(doc.links.length, 1);
  });
});
