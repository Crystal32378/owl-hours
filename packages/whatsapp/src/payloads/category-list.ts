// Payload 02: the category list. Row ids are cat_<category>.
import { listMessage, type ListSection, type OutgoingMessage } from "../client.ts";

export const CATEGORY_LIST: ListSection[] = [
  {
    title: "Home",
    rows: [
      { id: "cat_plumbing", title: "Plumbing", description: "Leaks, drains, toilets, water heaters" },
      { id: "cat_electrical", title: "Electrical", description: "Power, outlets, lights" },
      { id: "cat_locksmith", title: "Locksmith", description: "Locked out, lock changes" },
    ],
  },
  {
    title: "Everyday",
    rows: [
      { id: "cat_food", title: "Food and drinks", description: "Restaurants, bakeries, catering" },
      { id: "cat_beauty", title: "Beauty and care", description: "Salons, barbers, spas" },
      { id: "cat_auto", title: "Car and moto", description: "Mechanics, tires, car wash" },
      { id: "cat_pets", title: "Pets", description: "Vets, grooming, pet shops" },
    ],
  },
  { title: "Other", rows: [{ id: "cat_other", title: "Something else", description: "Tell me what you need" }] },
];

const BODY = "What are you looking for? You can also send a photo, a video or a voice note.";

export function whatAreYouLookingFor(input: { to: string }): OutgoingMessage {
  return listMessage(input.to, {
    body: BODY,
    button: "See options",
    sections: CATEGORY_LIST,
    footer: "Only businesses open now and near you",
  });
}
