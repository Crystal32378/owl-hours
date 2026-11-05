// Figtree for the DOM screens, the font Astryx Neutral uses. Astryx's fonts.css loads it with a CSS
// @import, which Expo's DOM component export lists as a .css-external asset it never writes, so EAS
// Update fails to upload. Linking the same stylesheet at runtime keeps the font and the export clean.
export const FIGTREE_STYLESHEET = "https://fonts.googleapis.com/css2?family=Figtree:wght@400;500;600;700&display=swap";

const LINK_ID = "zukki-figtree";

type LinkElement = { id: string; rel: string; href: string };

// The DOM document, or a test double with the same few members.
type StylesheetHost<Link extends LinkElement> = {
  getElementById(id: string): unknown;
  createElement(tag: "link"): Link;
  head: { appendChild(link: Link): unknown };
};

export function addFigtreeStylesheet<Link extends LinkElement>(doc: StylesheetHost<Link>): void {
  if (doc.getElementById(LINK_ID)) return;
  const link = doc.createElement("link");
  link.id = LINK_ID;
  link.rel = "stylesheet";
  link.href = FIGTREE_STYLESHEET;
  doc.head.appendChild(link);
}

// Each DOM screen imports this module; static rendering has no document.
if (typeof document !== "undefined") addFigtreeStylesheet<HTMLLinkElement>(document);
