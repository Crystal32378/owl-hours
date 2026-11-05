// One Spark call that reads what the customer needs: on topic or not, the
// directory category, urgency, and a title and summary for the business's
// request card. Structured output, so our code decides every next step.
import { textPart, type ChatChoice, type ChatRequest, type ContentPart } from "@owl-hours/meta-models";
import { CATEGORIES, type Category } from "@owl-hours/shared";
import { z } from "zod";
import { zodToJsonSchema } from "../agent/json-schema.ts";
import { historyText } from "./history.ts";
import type { HistoryEntry, Understanding } from "./types.ts";

const TITLE_MAX = 120;
const SUMMARY_MAX = 600;

const needSchema = z
  .object({
    on_topic: z.boolean(),
    category: z.enum(CATEGORIES).nullable(),
    urgent: z.boolean(),
    title: z.string(),
    summary: z.string(),
  })
  .strict();

export const UNDERSTAND_PROMPT = [
  "You read messages a customer sends to Zukki, a WhatsApp assistant that finds a local business that is open now and connects the customer with it.",
  "Return only JSON with these fields:",
  "- on_topic: false only when the message is clearly not about finding or contacting a local business (weather, homework, general chat). Greetings and unclear requests are on topic.",
  `- category: one of ${CATEGORIES.join(", ")}, or null when you cannot tell yet.`,
  "- urgent: true when something is going wrong right now (a leak, no power, locked out).",
  '- title: 3 to 8 plain words for the business, e.g. "Toilet won\'t stop running". Empty when unclear.',
  "- summary: one or two plain sentences of what the customer needs, from what they said or showed. Empty when unclear. Never invent details.",
].join("\n");

export async function understandNeed(
  chat: (request: ChatRequest) => Promise<ChatChoice>,
  input: { history: HistoryEntry[]; parts: ContentPart[]; knownCategory: Category | null },
): Promise<Understanding> {
  const earlier = input.history.length > 0 ? [textPart(`Earlier in this chat:\n${historyText(input.history)}\n\nNew message:`)] : [];
  const known = input.knownCategory
    ? ` Earlier the customer needed: ${input.knownCategory}. If the new message asks for something different, return the new category.`
    : "";
  const choice = await chat({
    messages: [
      { role: "system", content: `${UNDERSTAND_PROMPT}${known}` },
      { role: "user", content: [...earlier, ...input.parts] },
    ],
    responseFormat: { type: "json_schema", json_schema: { name: "customer_need", schema: zodToJsonSchema(needSchema) } },
    temperature: 0,
  });
  const raw = (choice.message.content ?? "").trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  const need = needSchema.parse(JSON.parse(raw));
  return {
    onTopic: need.on_topic,
    category: need.category,
    urgent: need.urgent,
    title: tidy(need.title, TITLE_MAX),
    summary: tidy(need.summary, SUMMARY_MAX),
  };
}

function tidy(value: string, max: number): string | null {
  const trimmed = value.trim().replace(/\s+/g, " ").slice(0, max);
  return trimmed.length > 0 ? trimmed : null;
}
