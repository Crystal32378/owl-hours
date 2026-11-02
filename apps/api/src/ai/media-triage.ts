// Spark reads the customer's whole photo or video before anything else looks at it: what is wrong,
// whether closing the water would stop it, and where SAM should look for the valve
// (https://dev.meta.ai/docs/sam/segmenting: SAM locates what it is told to, Spark reasons about the scene).
import { z } from "zod";
import type { UnderstandMediaInput } from "@owl-hours/meta-models";

const SEVERITIES = ["emergency", "urgent", "routine", "none"] as const;
const SHUT_OFF_ANSWERS = ["helps", "wont_help", "unclear"] as const;

const triageSchema = z.object({
  problem: z.string().min(1),
  severity: z.enum(SEVERITIES),
  waterShutOff: z.enum(SHUT_OFF_ANSWERS),
  valveObject: z.string().nullable(),
  bestSeconds: z.number().nonnegative().nullable(),
});

export type MediaTriage = z.infer<typeof triageSchema>;

export type TriageInput = { mediaType: "image" | "video"; mediaUrl: string; caption: string | null };

const TRIAGE_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["problem", "severity", "waterShutOff", "valveObject", "bestSeconds"],
  properties: {
    problem: { type: "string" },
    severity: { type: "string", enum: SEVERITIES },
    waterShutOff: { type: "string", enum: SHUT_OFF_ANSWERS },
    valveObject: { type: ["string", "null"] },
    bestSeconds: { type: ["number", "null"] },
  },
};

const TRIAGE_PROMPT = [
  "A customer sent this to a home-repair assistant. Describe only what is visible or audible; do not assume a cause you cannot see.",
  "problem: one short sentence on what is wrong.",
  "severity: emergency when water or danger is spreading now, urgent when it needs help today, routine when it can wait, none when nothing is wrong.",
  "waterShutOff: helps when closing a water supply valve would stop this problem. wont_help when it clearly would not, such as rain, a roof or gutter, an old stain, or nothing wrong. unclear in every other case, and whenever you doubt.",
  "valveObject: the shortest plain noun for a water shut-off valve you can clearly see, such as valve. Null when none is clearly visible.",
  "bestSeconds: for a video, the second where that valve, or otherwise the problem, is clearest. Null for a photo.",
].join("\n");

export async function triageMedia(
  understand: (input: UnderstandMediaInput) => Promise<string>,
  input: TriageInput,
): Promise<MediaTriage> {
  const answer = await understand({
    prompt: input.caption ? `${TRIAGE_PROMPT}\nThe customer wrote: ${input.caption}` : TRIAGE_PROMPT,
    mediaType: input.mediaType,
    mediaUrl: input.mediaUrl,
    schemaName: "media_triage",
    schema: TRIAGE_JSON_SCHEMA,
  });
  const triage = triageSchema.parse(JSON.parse(answer));
  return { ...triage, valveObject: triage.valveObject?.trim() || null };
}
