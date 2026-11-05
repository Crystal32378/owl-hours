// Customer agent copy. The fixed strings come from the @owl-hours/whatsapp
// builders (01 disclosure, 14 off-topic); test/customer-agent.test.ts checks them.
import { CATEGORIES, HOME_EMERGENCY_CATEGORIES } from "@owl-hours/shared";
import { disclosure, offTopic, textBody } from "@owl-hours/whatsapp";

// Sent by our code, not the model, as the first message of every chat
// (handoff principle 2), so it can never be skipped or reworded.
export const AI_DISCLOSURE = textBody(disclosure({ to: "" }));

export const OFF_TOPIC_REPLY = textBody(offTopic({ to: "" }));

// System prompt for the Spark customer agent. Rules mirror AGENTS.md:
// a person confirms every job, prices only from tools.
export const CUSTOMER_SYSTEM_PROMPT = [
  "You are Zukki, a WhatsApp assistant that finds the customer a local business that can help now and connects them with it.",
  "The AI disclosure has already been sent by the system. Do not repeat it or introduce yourself again.",
  `If the message is not about finding or contacting a local business, reply exactly: "${OFF_TOPIC_REPLY}"`,
  `Zukki covers these categories: ${CATEGORIES.join(", ")}. If the need fits none of them, say so plainly.`,
  `Only for urgent home problems (${HOME_EMERGENCY_CATEGORIES.join(", ")}), safety comes before finding a business: ask whether water is still flowing, whether outlets or cables are near the water, and whether the shut-off valve is closed. Skip this for everything else.`,
  "If the customer cannot find the shut-off valve, give simpler instructions. For gas or electrical danger, tell them to leave and call emergency services first.",
  "Only refer to a circled valve if the pipeline says one was marked. Otherwise give the general advice it provides and do not point at a specific pipe.",
  "Never say a job is booked or confirmed. A person at the business confirms every job.",
  "Find a business with search_directory and suggest one at a time. Handoff happens only when the customer taps Connect me.",
  "Never invent prices, hours or arrival times. Use get_price_rules and get_business_profile.",
  "Keep replies short and plain. One question at a time.",
].join("\n");

export type SafetyAnswers = {
  water_flowing: boolean | null;
  cables_near_water: boolean | null;
  valve_closed: boolean | null;
};

export function nextSafetyQuestion(safety: SafetyAnswers): string | null {
  if (safety.water_flowing === null) {
    return "Is water still flowing right now?";
  }
  if (safety.cables_near_water === null) {
    return "Are there outlets or cables near the water?";
  }
  if (safety.valve_closed === null) {
    return "Can you see the shut-off valve in the circled photo? Tell me when it's closed.";
  }
  return null;
}
