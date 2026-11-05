// Payload 05: WhatsApp's own Send location button.
import { locationRequestMessage, type OutgoingMessage } from "../client.ts";
import { capitalize, someone, type Category } from "./nouns.ts";

export function locationRequest(input: { to: string; category: Category; waterOff: boolean }): OutgoingMessage {
  return locationRequestMessage(input.to, locationBody(input.category, input.waterOff));
}

function locationBody(category: Category, waterOff: boolean): string {
  const ask = `share your location so I can find ${someone(category)}.`;
  const lead = waterOff ? `Good, the water is off. Now ${ask}` : capitalize(ask);
  return `${lead} The business only sees the exact address after you approve a visit.`;
}
