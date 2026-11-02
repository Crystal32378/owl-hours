// Valve marking (handoff: the circled-valve photo). SAM finds the valve on
// the customer's real frame; our code draws the ring, arrow and label. When SAM is unsure we
// send generic advice instead of pointing at a pipe that may be wrong.
import type { SamDetection } from "@owl-hours/meta-models";
import { markupSvg, valveMarkup } from "./valve-markup.ts";
import type { SvgForSize } from "../media/draw-markup.ts";

// SAM 3.1 finds no valve for "shut-off valve" or "water valve". On real photos "plumbing valve"
// and "valve" each found one the other missed, so words try the broader phrase first.
export const VALVE_CONCEPT = "valve";
const BROAD_VALVE_CONCEPT = "plumbing valve";

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

export type ValvePoint = { x: number; y: number };
export type FrameSize = { width: number; height: number };

export type MarkValveInput = {
  framePath: string;
  imageUrl: string;
  // A first word to try, when Spark named the object.
  concept?: string | undefined;
  // Spark's valves on this frame, 0-1000 of its width and height; SAM cuts each one out.
  locate?: (imageUrl: string) => Promise<ValvePoint[]>;
  frameSize?: (framePath: string) => Promise<FrameSize>;
  segmentAt?: (point: ValvePoint & FrameSize, imageUrl: string) => Promise<SamDetection[]>;
  segment: (concept: string, imageUrl: string) => Promise<SamDetection[]>;
  // Renders the SVG (built in SAM's coordinates) at the frame's pixel size.
  drawOverlay: (framePath: string, svgFor: SvgForSize) => Promise<string>;
  threshold?: number;
};

export async function markValve(input: MarkValveInput): Promise<ValveResult> {
  const threshold = input.threshold ?? VALVE_CONFIDENCE_THRESHOLD;
  const located = await detectionsAtSparkPoints(input, threshold);
  const found = located.length > 0 ? located : await firstFindByWords(input, threshold);
  const [best] = found;
  if (!best) {
    return { kind: "fallback", advice: GENERIC_VALVE_ADVICE };
  }
  const markups = found.map((detection) => valveMarkup(detection.box, detection.width, detection.height));
  const markedFramePath = await input.drawOverlay(input.framePath, (pixelWidth, pixelHeight) =>
    markupSvg(markups, best.width, best.height, pixelWidth, pixelHeight),
  );
  return { kind: "marked", markedFramePath, detection: best };
}

// A failed Spark or SAM call here only costs the points: the words below still run.
async function detectionsAtSparkPoints(input: MarkValveInput, threshold: number): Promise<SamDetection[]> {
  if (!input.locate || !input.segmentAt || !input.frameSize) return [];
  const { locate, segmentAt, frameSize } = input;
  try {
    const [points, size] = await Promise.all([locate(input.imageUrl), frameSize(input.framePath)]);
    const asked = points.map((point) => segmentAt(toPixels(point, size), input.imageUrl));
    const answers = await Promise.all(asked);
    return answers.flatMap((detections) => {
      const best = pickValve(detections, threshold);
      return best ? [best] : [];
    });
  } catch {
    return [];
  }
}

function toPixels(point: ValvePoint, size: FrameSize) {
  return {
    x: Math.round((point.x / 1000) * size.width),
    y: Math.round((point.y / 1000) * size.height),
    ...size,
  };
}

async function firstFindByWords(input: MarkValveInput, threshold: number): Promise<SamDetection[]> {
  const words = new Set([...(input.concept ? [input.concept] : []), BROAD_VALVE_CONCEPT, VALVE_CONCEPT]);
  for (const word of words) {
    const best = pickValve(await input.segment(word, input.imageUrl), threshold);
    if (best) return [best];
  }
  return [];
}
