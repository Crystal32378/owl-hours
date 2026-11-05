// Zukki's turn after a customer message is stored. The steps of the demo
// flow are fixed code (disclosure, safety, location, card, connect); the
// model only reads what the customer needs and answers free questions.
// Messages are queued in the outbox, which sends them in order.
import { textPart, type ContentPart } from "@owl-hours/meta-models";
import { HOME_EMERGENCY_CATEGORIES, categoryFromListReply, type Category } from "@owl-hours/shared";
import { isQuestionTap, nounFor } from "@owl-hours/whatsapp";
import { errorText } from "../whatsapp/inbound.ts";
import * as copy from "./copy.ts";
import type { ConversationFacts, RespondDeps, Turn, TurnContext, Understanding, ZukkiMessage } from "./types.ts";

const HISTORY_LIMIT = 12;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const ZUKKI_WORD = /^\s*\*?zukki\b/i;

export async function respond(deps: RespondDeps, ctx: TurnContext, turn: Turn): Promise<void> {
  const queue = (message: ZukkiMessage, tenantId: string | null = null) =>
    deps.store.queue(ctx.conversationId, message, tenantId);
  try {
    if (ctx.businessId) {
      await inBusinessChat(deps, ctx, turn, ctx.businessId, queue);
      return;
    }
    if (ctx.isNewConversation) {
      await queue(copy.disclosure());
    }
    switch (turn.kind) {
      case "button":
        await onButton(deps, ctx, turn.id, queue);
        return;
      case "location":
        await onLocation(deps, ctx, queue);
        return;
      case "media_failed":
        await queue(copy.mediaFailed());
        return;
      case "text":
      case "media":
        await onMessage(deps, ctx, turn, queue);
        return;
    }
  } catch (error) {
    deps.log.error(`zukki: turn ${ctx.waMessageId} in ${ctx.conversationId} failed: ${errorText(error)}`);
    await queue(copy.somethingWentWrong()).catch((queueError: unknown) =>
      deps.log.error(`zukki: could not queue the apology: ${errorText(queueError)}`),
    );
  }
}

type Queue = (message: ZukkiMessage, tenantId?: string | null) => Promise<void>;

// Product rule 6: the owner talks; Zukki answers only to its name.
async function inBusinessChat(deps: RespondDeps, _ctx: TurnContext, turn: Turn, businessId: string, queue: Queue) {
  if (turn.kind === "button") {
    await onBusinessButton(deps, turn.id, businessId, queue);
    return;
  }
  if (turn.kind === "text" && ZUKKI_WORD.test(turn.text)) {
    await queue(copy.zukkiIsBack(await businessDisplayName(deps, businessId)), businessId);
  }
}

// S6: a question tap asks the customer to type the question for the
// business; reply_ok and anything else queues nothing to the customer.
async function onBusinessButton(deps: RespondDeps, id: string, businessId: string, queue: Queue): Promise<void> {
  if (!isQuestionTap(id)) return;
  await queue(copy.typeYourQuestion(await businessDisplayName(deps, businessId)), businessId);
}

async function businessDisplayName(deps: RespondDeps, businessId: string): Promise<string> {
  return (await deps.store.businessName(businessId)) ?? "the business";
}

async function onButton(deps: RespondDeps, ctx: TurnContext, id: string, queue: Queue) {
  const facts = await deps.store.facts(ctx.conversationId);
  if (id === "safety_got_it") {
    if (!facts.locationAsked) await queue(copy.locationRequest(facts.category ?? "plumbing", { waterOff: false }));
    return;
  }
  if (id === "safety_done" || id === "safety_cant_find") {
    if (id === "safety_cant_find") await queue(copy.cantFindValve());
    await queue(copy.locationRequest(facts.category ?? "plumbing", { waterOff: id === "safety_done" }));
    return;
  }
  if (id.startsWith("cat_")) {
    await onCategory(deps, ctx, id, queue);
    return;
  }
  if (id === "another_option") {
    if (!facts.category) {
      await queue(copy.categoryList());
      return;
    }
    await suggest(deps, ctx, facts.category, queue, { another: true });
    return;
  }
  const businessId = id.startsWith("connect:") ? id.slice("connect:".length) : null;
  if (businessId !== null && UUID.test(businessId)) {
    await connect(deps, ctx, facts, businessId, queue);
    return;
  }
  // reply_ok, reply_question, quote_question and the rest are for the owner's chat.
  deps.log.info(`zukki: no step for button ${id} in ${ctx.conversationId}`);
}

async function onCategory(deps: RespondDeps, ctx: TurnContext, id: string, queue: Queue) {
  const category = categoryFromListReply(id);
  if (category === null || category === "other") {
    await queue(copy.askWhatTheyNeed());
    return;
  }
  const home = HOME_EMERGENCY_CATEGORIES.includes(category);
  await deps.store.saveNeed(ctx.conversationId, { category, urgency: home ? "now" : "today", title: null, summary: null });
  // Home problems need a description first (for the safety step).
  await queue(home ? copy.describeNeed(category) : copy.locationRequest(category, { waterOff: false }));
}

async function onLocation(deps: RespondDeps, ctx: TurnContext, queue: Queue) {
  const facts = await deps.store.facts(ctx.conversationId);
  if (!facts.category) {
    await queue(copy.categoryList());
    return;
  }
  await queue(copy.finding(facts.category));
  await suggest(deps, ctx, facts.category, queue);
}

async function suggest(deps: RespondDeps, ctx: TurnContext, category: Category, queue: Queue, options: { another?: boolean } = {}) {
  const [best] = await deps.directory.matches(ctx.conversationId, category);
  await queue(best ? copy.suggestion(best, category) : copy.noneNearby(category, options));
}

async function connect(deps: RespondDeps, ctx: TurnContext, facts: ConversationFacts, businessId: string, queue: Queue) {
  try {
    const offer = await deps.directory.connect(ctx.conversationId, businessId);
    const name = (await deps.store.businessName(businessId)) ?? "the business";
    const minutes = Math.max(1, Math.round((Date.parse(offer.expiresAt) - deps.now().getTime()) / 60_000));
    await queue(copy.requestSent(name, minutes));
  } catch (error) {
    deps.log.warn(`zukki: connect to ${businessId} in ${ctx.conversationId} refused: ${errorText(error)}`);
    await queue(facts.state === "offered" ? copy.alreadyOffered() : copy.connectFailed());
  }
}

async function onMessage(deps: RespondDeps, ctx: TurnContext, turn: Extract<Turn, { kind: "text" | "media" }>, queue: Queue) {
  await deps.typing?.(ctx.waMessageId).catch((error: unknown) => deps.log.warn(`zukki: typing indicator failed: ${errorText(error)}`));
  const facts = await deps.store.facts(ctx.conversationId);
  const history = await deps.store.history(ctx.conversationId, HISTORY_LIMIT, ctx.waMessageId);

  let parts: ContentPart[];
  let markedFrameUrl: string | null = null;
  let valveAdvice: string | null = null;
  let shutOffWontHelp = false;
  let analysis: string | null = null;
  let serious = false;
  if (turn.kind === "media") {
    const findValve = facts.category === null || facts.category === "plumbing";
    // Reading a video takes up to a minute, longer than WhatsApp's typing indicator lasts.
    if (turn.mediaType !== "audio") await queue(copy.lookingAtMedia());
    const reading = await deps.readMedia({ conversationId: ctx.conversationId, mediaId: turn.mediaId, mediaType: turn.mediaType, caption: turn.caption, findValve });
    if (reading.transcript) await deps.store.saveTranscript(turn.mediaId, reading.transcript);
    ({ parts, markedFrameUrl, valveAdvice, shutOffWontHelp, analysis, serious } = reading);
  } else {
    parts = [textPart(turn.text)];
  }

  const understanding = await understandOrFallback(deps, history, parts, facts);
  // Sent before the checks below, so a reading rated urgent survives an unknown category.
  if (analysis && understanding?.onTopic !== false) await queue(copy.mediaAnalysis(analysis));
  if (!understanding) {
    await queue(copy.categoryList());
    return;
  }
  if (!understanding.onTopic) {
    await queue(copy.offTopic());
    return;
  }
  // While Zukki still has the chat, a customer who asks for something else gets the new category.
  const switched =
    facts.state === "with_zukki" && facts.category !== null && understanding.category !== null && understanding.category !== facts.category;
  const known = switched ? null : facts.category;
  const category = known ?? understanding.category;
  if (!category) {
    await queue(copy.categoryList());
    return;
  }
  const urgent = serious || (known ? facts.urgency === "now" : understanding.urgent);
  // A category picked from the list is saved without a title; the description
  // that follows names the request the business sees on the offer, once.
  if (!known || (understanding.title && !facts.hasTitle)) {
    await deps.store.saveNeed(ctx.conversationId, {
      category,
      // A switched request takes the new urgency; a known one keeps what was saved.
      urgency: (known ? facts.urgency : null) ?? (urgent ? "now" : "today"),
      title: understanding.title,
      summary: understanding.summary,
    });
  }

  const markedValve = category === "plumbing" && markedFrameUrl !== null;
  if (facts.state === "with_zukki" && facts.safety === "none" && (urgent || markedValve)) {
    if (markedValve) {
      await queue(copy.waterSafety({ markedFrameUrl, advice: valveAdvice, ifItGetsWorse: shutOffWontHelp }));
      if (!shutOffWontHelp) return;
    } else if (category === "plumbing" && shutOffWontHelp) {
      await queue(copy.shutOffWontHelp());
    } else if (category === "plumbing") {
      await queue(copy.waterSafety({ markedFrameUrl, advice: valveAdvice }));
      return;
    }
    if (category === "electrical") {
      await queue(copy.electricalSafety());
      await queue(copy.locationRequest(category, { waterOff: false }));
      return;
    }
  }
  // A voice note or photo sent right after the safety card: the card already asks the question.
  if (facts.safety === "awaiting" && turn.kind === "media") {
    deps.log.info(`zukki: kept quiet on ${ctx.waMessageId}, safety buttons are waiting`);
    return;
  }
  if (facts.state === "with_zukki" && !facts.hasLocation && !facts.locationAsked && facts.safety !== "awaiting") {
    await queue(copy.locationRequest(category, { waterOff: false }));
    return;
  }
  const reply = (await deps.answer({ conversationId: ctx.conversationId, history, parts, note: stepNote(facts, category) })).trim();
  if (reply) await queue({ kind: "text", body: reply.slice(0, 4096) });
}

async function understandOrFallback(
  deps: RespondDeps,
  history: Awaited<ReturnType<RespondDeps["store"]["history"]>>,
  parts: ContentPart[],
  facts: ConversationFacts,
): Promise<Understanding | null> {
  try {
    return await deps.understand({ history, parts, knownCategory: facts.category });
  } catch (error) {
    deps.log.warn(`zukki: could not read the need: ${errorText(error)}`);
    if (!facts.category) return null;
    return { onTopic: true, category: facts.category, urgent: facts.urgency === "now", title: null, summary: null };
  }
}

// Where the conversation stands, so Spark's answer fits the next step.
function stepNote(facts: ConversationFacts, category: Category): string {
  const step = facts.state === "offered"
    ? "The request was sent to a business; we are waiting for it to accept. Do not suggest another business unless asked."
    : facts.state === "accepted" || facts.state === "chatting"
      ? "A business accepted and is chatting with the customer."
      : facts.safety === "awaiting"
        ? "Safety buttons were sent; help the customer stop the damage first."
        : !facts.hasLocation
          ? "Waiting for the customer to share their location with the Send location button. Remind them briefly."
          : "A business card was shown. The customer taps Connect me to send the request.";
  return `Conversation state: the customer needs a ${nounFor(category)}. ${step}`;
}
