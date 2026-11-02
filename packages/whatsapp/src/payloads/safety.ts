// Payload 04: stop-the-water card. With a marked frame the image shows the
// valve; without one the advice is general and there is no picture.
import { buttonMessage, type OutgoingMessage, type ReplyButton } from "../client.ts";
import { BUTTON_BODY_MAX, clip } from "./limits.ts";

export const SAFETY_BUTTONS: ReplyButton[] = [
  { id: "safety_done", title: "Done, no cables" },
  { id: "safety_cant_find", title: "I can't find it" },
];

const MARKED_BODY = "Let's stop the water first: turn this valve clockwise. Any outlets or cables near the water?";
const MARKED_FOR_LATER_BODY = "If it gets worse, turn this valve clockwise to stop the water. Any outlets or cables near the water?";
const DEFAULT_ADVICE =
  "Find the shut-off valve on the pipe under or behind the fixture and turn it clockwise until it stops.";

export function safetyMarkedFrame(input: {
  to: string;
  markedFrameUrl: string | null;
  advice?: string | null | undefined;
  // The valve is shown for later: closing it would not stop what the customer sent.
  ifItGetsWorse?: boolean | undefined;
}): OutgoingMessage {
  return buttonMessage(input.to, {
    body: clip(safetyBody(input.markedFrameUrl, input.advice ?? null, input.ifItGetsWorse ?? false), BUTTON_BODY_MAX),
    buttons: SAFETY_BUTTONS,
    ...(input.markedFrameUrl ? { headerImageUrl: input.markedFrameUrl } : {}),
  });
}

function safetyBody(markedFrameUrl: string | null, advice: string | null, ifItGetsWorse: boolean): string {
  if (markedFrameUrl) return ifItGetsWorse ? MARKED_FOR_LATER_BODY : MARKED_BODY;
  return `Let's stop the water first. ${advice ?? DEFAULT_ADVICE} Any outlets or cables near the water?`;
}
