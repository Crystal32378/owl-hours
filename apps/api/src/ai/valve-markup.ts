// Geometry for the marked frame (payload 04): a ring around SAM's box, an
// arrow pointing at it from the side with more room, and a short label.
// Pure, so it is tested without an image library; draw-markup.ts renders it.
import type { SamBox } from "@owl-hours/meta-models";

export const VALVE_LABEL = "Shut-off valve";

const RING_PADDING = 1.15;
const MIN_STROKE = 4;
const MIN_FONT = 16;

export type Point = { x: number; y: number };

export type ValveMarkup = {
  stroke: number;
  ring: { cx: number; cy: number; r: number };
  arrow: { from: Point; to: Point; head: [Point, Point, Point] };
  label: { x: number; y: number; width: number; height: number; fontSize: number; text: string };
};

const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value));
const round = (value: number) => Math.round(value * 10) / 10;
const point = (x: number, y: number): Point => ({ x: round(x), y: round(y) });

// Arrow direction: from the ring towards the middle of the frame, where
// there is room; up-left when the valve is already in the middle.
function direction(cx: number, cy: number, width: number, height: number): Point {
  const dx = width / 2 - cx;
  const dy = height / 2 - cy;
  const length = Math.hypot(dx, dy);
  if (length < Math.min(width, height) * 0.05) {
    return { x: -Math.SQRT1_2, y: -Math.SQRT1_2 };
  }
  return { x: dx / length, y: dy / length };
}

export function valveMarkup(box: SamBox, width: number, height: number, text = VALVE_LABEL): ValveMarkup {
  const minSide = Math.min(width, height);
  const stroke = Math.max(MIN_STROKE, Math.round(minSide / 80));
  const cx = (box.x1 + box.x2) / 2;
  const cy = (box.y1 + box.y2) / 2;
  const r = clamp((Math.hypot(box.x2 - box.x1, box.y2 - box.y1) / 2) * RING_PADDING, minSide * 0.04, minSide * 0.45);

  const u = direction(cx, cy, width, height);
  const fontSize = Math.max(MIN_FONT, Math.round(minSide / 22));
  const labelWidth = Math.round(fontSize * 0.6 * text.length + fontSize);
  const labelHeight = Math.round(fontSize * 1.6);
  const margin = stroke * 2;

  // Tip just outside the ring; tail far enough out to read as an arrow.
  const tip = { x: cx + u.x * (r + stroke * 1.5), y: cy + u.y * (r + stroke * 1.5) };
  const reach = Math.max(minSide * 0.16, stroke * 8);
  const tail = {
    x: clamp(tip.x + u.x * reach, margin, width - margin),
    y: clamp(tip.y + u.y * reach, margin, height - margin),
  };
  const headSize = stroke * 3;
  const base = { x: tip.x + u.x * headSize, y: tip.y + u.y * headSize };
  const across = { x: -u.y * headSize * 0.6, y: u.x * headSize * 0.6 };

  const labelX = clamp(tail.x + u.x * (labelWidth / 2 + stroke) - labelWidth / 2, margin, width - margin - labelWidth);
  const labelY = clamp(tail.y + u.y * (labelHeight / 2 + stroke) - labelHeight / 2, margin, height - margin - labelHeight);

  return {
    stroke,
    ring: { cx: round(cx), cy: round(cy), r: round(r) },
    arrow: {
      from: point(tail.x, tail.y),
      to: point(base.x, base.y),
      head: [point(tip.x, tip.y), point(base.x + across.x, base.y + across.y), point(base.x - across.x, base.y - across.y)],
    },
    label: { x: round(labelX), y: round(labelY), width: labelWidth, height: labelHeight, fontSize, text },
  };
}

const escapeXml = (value: string) =>
  value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[c] ?? c);

// SVG in SAM's coordinate space, scaled to the frame's real pixel size.
export function markupSvg(marks: ValveMarkup | ValveMarkup[], viewWidth: number, viewHeight: number, pixelWidth = viewWidth, pixelHeight = viewHeight): string {
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${pixelWidth}" height="${pixelHeight}" viewBox="0 0 ${viewWidth} ${viewHeight}" preserveAspectRatio="none">`,
    ...[marks].flat().map((mark, index) => markupShapes(mark, index === 0)),
    "</svg>",
  ].join("");
}

// One label is enough: with two valves the labels land on top of each other near the middle.
function markupShapes(m: ValveMarkup, withLabel: boolean): string {
  const { ring, arrow, label, stroke } = m;
  const head = arrow.head.map((p) => `${p.x},${p.y}`).join(" ");
  const shadow = `stroke="#000" stroke-opacity="0.45" stroke-width="${stroke + 4}"`;
  return [
    `<circle cx="${ring.cx}" cy="${ring.cy}" r="${ring.r}" fill="none" ${shadow}/>`,
    `<line x1="${arrow.from.x}" y1="${arrow.from.y}" x2="${arrow.to.x}" y2="${arrow.to.y}" stroke-linecap="round" ${shadow}/>`,
    `<circle cx="${ring.cx}" cy="${ring.cy}" r="${ring.r}" fill="none" stroke="#FF3B30" stroke-width="${stroke}"/>`,
    `<line x1="${arrow.from.x}" y1="${arrow.from.y}" x2="${arrow.to.x}" y2="${arrow.to.y}" stroke="#FF3B30" stroke-width="${stroke}" stroke-linecap="round"/>`,
    `<polygon points="${head}" fill="#FF3B30" stroke="#000" stroke-opacity="0.45" stroke-width="2"/>`,
    withLabel ? `<rect x="${label.x}" y="${label.y}" width="${label.width}" height="${label.height}" rx="${Math.round(label.height / 4)}" fill="#000" fill-opacity="0.72"/>` : "",
    withLabel ? `<text x="${round(label.x + label.width / 2)}" y="${round(label.y + label.height / 2)}" fill="#fff" font-family="DejaVu Sans, Arial, Helvetica, sans-serif" font-weight="700" font-size="${label.fontSize}" text-anchor="middle" dominant-baseline="central">${escapeXml(label.text)}</text>` : "",
  ].join("");
}
