// Valve marking (handoff: the circled-valve photo). SAM finds the valve on
// the customer's real frame; our code draws the ring, arrow and label. When SAM is unsure we
// send generic advice instead of pointing at a pipe that may be wrong.
import type { SamDetection } from "@owl-hours/meta-models";
import { markupSvg, valveMarkup } from "./valve-markup.ts";
import type { SvgForSize } from "../media/draw-markup.ts";

// On a photo of a shut-off valve SAM 3.1 finds "valve" but nothing for "shut-off valve" or "water valve".
export const VALVE_CONCEPT = "valve";

// Starting point only: tune on real customer videos before the demo.
export const VALVE_CONFIDENCE_THRESHOLD = 0.5;

export const GENERIC_VALVE_ADVICE =
  "I couldn't spot the shut-off valve in what you sent. It is usually a small handle or knob on the pipe under or behind the fixture. Turn it clockwise until it stops. If you can't find one, the main shut-off is often where the water line enters your home.";

export type ValveResult =
  | { kind: "marked"; markedFramePath: string; detection: SamDetection }
  | { kind: "fallback"; advice: string };

export function pickValve(detections: SamDetection[], threshold: number): SamDetection | null {
  return detections.reduce<SamDetection | null>((best, candidate) => {
    if (candidate.confidence === null || candidate.confidence < threshold) {
      return best;
    }
    return best && (best.confidence ?? 0) >= candidate.confidence ? best : candidate;
  }, null);
}

export type MarkValveInput = {
  framePath: string;
  imageUrl: string;
  // The object to look for; VALVE_CONCEPT unless Spark named it.
  concept?: string | undefined;
  segment: (concept: string, imageUrl: string) => Promise<SamDetection[]>;
  // Renders the SVG (built in SAM's coordinates) at the frame's pixel size.
  drawOverlay: (framePath: string, svgFor: SvgForSize) => Promise<string>;
  threshold?: number;
};

export async function markValve(input: MarkValveInput): Promise<ValveResult> {
  const detections = await input.segment(input.concept ?? VALVE_CONCEPT, input.imageUrl);
  const best = pickValve(detections, input.threshold ?? VALVE_CONFIDENCE_THRESHOLD);
  if (!best) {
    return { kind: "fallback", advice: GENERIC_VALVE_ADVICE };
  }
  const markup = valveMarkup(best.box, best.width, best.height);
  const markedFramePath = await input.drawOverlay(input.framePath, (pixelWidth, pixelHeight) =>
    markupSvg(markup, best.width, best.height, pixelWidth, pixelHeight),
  );
  return { kind: "marked", markedFramePath, detection: best };
}
