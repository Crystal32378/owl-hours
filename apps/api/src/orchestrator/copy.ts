// Zukki's wording, built by @owl-hours/whatsapp (payloads 01-15). Written by
// our code, not the model, so the disclosure, safety steps and prices can
// never be reworded or invented.
//
// copy queues the content: the body plus the row extras the wire format has
// no room for (variant, business_id, quote_id, notice). The outbox addresses
// the real recipient at send time. Every payload string, button, header,
// footer and limit lives in the builders.
import * as builders from "@owl-hours/whatsapp";
import type { Category } from "@owl-hours/shared";
import type { Match, ReplyButton, ZukkiMessage } from "./types.ts";

// The builders address the Cloud API body; the outbox sets the real
// recipient when it sends, so copy passes a blank `to` and keeps the content.
const QUEUE_TO = "";

const text = (body: string, payload?: Record<string, unknown>): ZukkiMessage =>
  payload ? { kind: "text", body, payload } : { kind: "text", body };

// The text of a built message of any kind (text, button card, list, location
// request): every one carries body.text.
function bodyOf(message: builders.OutgoingMessage): string {
  const text = message.text as { body: string } | undefined;
  if (text) return text.body;
  const interactive = message.interactive as { body: { text: string } };
  return interactive.body.text;
}

// The button-card parts of a built message: body, buttons, header and
// footer. The row keeps them under its variant with the extras the wire
// format has no room for (business_id, quote_id, notice).
function cardOf(message: builders.OutgoingMessage): {
  body: string;
  buttons: ReplyButton[];
  headerText?: string | undefined;
  headerImageUrl?: string | undefined;
  footer?: string | undefined;
} {
  const interactive = message.interactive as {
    body: { text: string };
    action: { buttons: Array<{ reply: ReplyButton }> };
    header?: { type: string; text?: string; image?: { link: string } } | undefined;
    footer?: { text: string } | undefined;
  };
  const header = interactive.header;
  return {
    body: interactive.body.text,
    buttons: interactive.action.buttons.map((button) => button.reply),
    ...(header?.type === "text" && header.text ? { headerText: header.text } : {}),
    ...(header?.type === "image" && header.image ? { headerImageUrl: header.image.link } : {}),
    ...(interactive.footer ? { footer: interactive.footer.text } : {}),
  };
}

// 01
export const disclosure = (): ZukkiMessage => text(builders.textBody(builders.disclosure({ to: QUEUE_TO })));

// 14
export const offTopic = (): ZukkiMessage => text(builders.textBody(builders.offTopic({ to: QUEUE_TO })));

// 02
export const categoryList = (): ZukkiMessage => ({
  kind: "interactive",
  body: bodyOf(builders.whatAreYouLookingFor({ to: QUEUE_TO })),
  payload: { variant: "category_list" },
});

// 04. With a marked frame the image shows the valve; without one, general
// advice and no picture (handoff rule 10: never point at a pipe we did not find).
export function waterSafety(input: { markedFrameUrl: string | null; advice: string | null }): ZukkiMessage {
  const card = cardOf(builders.safetyMarkedFrame({ to: QUEUE_TO, markedFrameUrl: input.markedFrameUrl, advice: input.advice }));
  return {
    kind: "interactive",
    body: card.body,
    payload: {
      variant: "safety",
      buttons: card.buttons,
      ...(card.headerImageUrl ? { header_image_url: card.headerImageUrl } : {}),
    },
  };
}

export const shutOffWontHelp = (): ZukkiMessage =>
  text("Closing your water valve won't stop this one. Keep clear of any outlets or cables near the water while I find you help.", {
    variant: "safety_text",
  });

export const cantFindValve = (): ZukkiMessage =>
  text(
    "No problem. Look for the main shut-off where the water line enters your home, often near the water meter, an outside wall or under the kitchen sink. Turn it clockwise until it stops. Stay away from outlets and cables near the water.",
  );

export const electricalSafety = (): ZukkiMessage =>
  text(
    "Stay safe first: don't touch outlets, switches or cables near water, and switch off the main breaker only if you can reach it safely. If you see sparks or smell burning, leave and call emergency services.",
    { variant: "safety_text" },
  );

// 05
export function locationRequest(category: Category, options: { waterOff: boolean }): ZukkiMessage {
  // public.messages needs a payload on every kind but text and media.
  return {
    kind: "location_request",
    body: bodyOf(builders.locationRequest({ to: QUEUE_TO, category, waterOff: options.waterOff })),
    payload: { variant: "location_request" },
  };
}

export const describeNeed = (category: Category): ZukkiMessage =>
  text(`Got it, I'll find you ${builders.article(builders.nounFor(category))}. What's going on? You can also send a photo, a video or a voice note.`);

export const askWhatTheyNeed = (): ZukkiMessage =>
  text("Tell me what you need, or send a photo, a video or a voice note.");

// 06
export const finding = (category: Category): ZukkiMessage => text(bodyOf(builders.finding({ to: QUEUE_TO, category })));

export const noneNearby = (category: Category, options: { another?: boolean } = {}): ZukkiMessage =>
  text(`I couldn't find ${builders.someone(category, options)} right now. Message me anytime and I'll look again.`);

// 07. Only lines the business actually has; prices come from its own rules.
export function suggestion(match: Match, category: Category, options: { afterTimeout?: boolean } = {}): ZukkiMessage {
  const card = cardOf(
    builders.suggestBusiness({
      to: QUEUE_TO,
      category,
      match: {
        businessId: match.businessId,
        businessName: match.name,
        rating: match.rating,
        reviews: match.reviews,
        distanceKm: match.distanceKm,
        openNow: match.openNow,
        visit: match.visit,
        nightFee: match.nightFee,
        repairFrom: match.repairFrom,
        repairLabel: match.repairLabel,
        etaMinutes: match.etaMinutes,
        currency: match.currency,
        takesNightJobs: match.takesNightJobs,
      },
      afterTimeout: options.afterTimeout,
    }),
  );
  return {
    kind: "interactive",
    body: card.body,
    payload: {
      variant: "suggest_business",
      business_id: match.businessId,
      header_text: card.headerText,
      footer: card.footer,
      buttons: card.buttons,
    },
  };
}

// 08
export const requestSent = (businessName: string, minutes: number): ZukkiMessage =>
  text(bodyOf(builders.requestSent({ to: QUEUE_TO, businessName, acceptMinutes: minutes })));

export const alreadyOffered = (): ZukkiMessage =>
  text("Your request is already with a business. I'll tell you as soon as they answer.");

export const connectFailed = (): ZukkiMessage =>
  text("Sorry, I couldn't send your request just now. Tap Connect me again in a moment.");

// 09 (followed by 07 for the next business)
export function nextBusiness(businessName: string, reason: "expired" | "declined", notice: string): ZukkiMessage {
  return text(bodyOf(builders.nextBusiness({ to: QUEUE_TO, businessName, reason })), { notice });
}

export function noNextBusiness(businessName: string, reason: "expired" | "declined", category: Category | null, notice: string): ZukkiMessage {
  return text(bodyOf(builders.noNextBusiness({ to: QUEUE_TO, businessName, reason, category })), { notice });
}

// 10
export const accepted = (businessName: string, notice: string): ZukkiMessage =>
  text(bodyOf(builders.accepted({ to: QUEUE_TO, businessName })), { notice });

// 15
export const zukkiIsBack = (businessName: string): ZukkiMessage =>
  text(bodyOf(builders.zukkiIsBack({ to: QUEUE_TO, businessName })));

// S6: the prompt after a question tap on 12 or 13. Plain text, no payload.
export const typeYourQuestion = (businessName: string): ZukkiMessage =>
  text(`Type your question and I'll pass it to ${businessName}.`);

export const mediaFailed = (): ZukkiMessage =>
  text("Sorry, I couldn't open that file. Could you send it again?");

export const somethingWentWrong = (): ZukkiMessage =>
  text("Sorry, something went wrong on my side. Please try again in a moment.");

// 13
export type QuoteCopy = {
  quoteId: string;
  businessName: string;
  technician: string | null;
  arrivalWindow: string | null;
  lines: Array<{ label: string; min: number; max: number }>;
  totalMin: number;
  totalMax: number;
  currency: string;
};

export function quote(input: QuoteCopy, notice: string): ZukkiMessage {
  const card = cardOf(
    builders.quote({
      to: QUEUE_TO,
      quoteId: input.quoteId,
      businessName: input.businessName,
      technician: input.technician,
      arrivalWindow: input.arrivalWindow,
      lines: input.lines,
      totalMin: input.totalMin,
      totalMax: input.totalMax,
      currency: input.currency,
    }),
  );
  return {
    kind: "interactive",
    body: card.body,
    payload: {
      variant: "quote",
      notice,
      quote_id: input.quoteId,
      header_text: card.headerText,
      footer: card.footer,
      buttons: card.buttons,
    },
  };
}
