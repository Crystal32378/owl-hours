// Conversation orchestrator: which Zukki messages each customer turn queues,
// in the order and wording of handoff-ui/whatsapp/payloads (01-15).
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { respond } from "../src/orchestrator/respond.ts";
import type {
  ConversationFacts,
  Match,
  MediaReading,
  RespondDeps,
  Turn,
  TurnContext,
  Understanding,
  ZukkiMessage,
} from "../src/orchestrator/types.ts";

const CHAT = "40000000-0000-4000-8000-000000000001";
const NORTHSIDE = "10000000-0000-4000-8000-000000000001";
const EASTSIDE = "10000000-0000-4000-8000-000000000002";
const MEDIA = "60000000-0000-4000-8000-000000000001";
const NOW = new Date("2026-11-03T05:05:00.000Z");

const northside: Match = {
  businessId: NORTHSIDE,
  name: "Northside Plumbing",
  shortName: "Northside",
  rating: 4.9,
  reviews: 128,
  distanceKm: 1.2,
  etaMinutes: 40,
  openNow: true,
  takesNightJobs: true,
  currency: "USD",
  visit: 45,
  nightFee: { amount: 25, window: "10 PM-7 AM" },
  repairFrom: 60,
  repairLabel: "Leak repair",
};

const baseFacts: ConversationFacts = {
  state: "with_zukki",
  category: null,
  urgency: null,
  safety: "none",
  locationAsked: false,
  hasLocation: false,
  hasTitle: false,
};

type Queued = { message: ZukkiMessage; tenantId: string | null };

function setup(options: {
  facts?: Partial<ConversationFacts>;
  understanding?: Partial<Understanding> | Error;
  reading?: Partial<MediaReading>;
  matches?: Match[];
  connect?: () => Promise<{ expiresAt: string }>;
  answer?: string;
} = {}) {
  const queued: Queued[] = [];
  const needs: unknown[] = [];
  const transcripts: Array<[string, string]> = [];
  const asked: { findValve?: boolean; note?: string; connected?: string } = {};
  const typing: string[] = [];
  const deps: RespondDeps = {
    store: {
      facts: async () => ({ ...baseFacts, ...options.facts }),
      queue: async (_id, message, tenantId) => {
        // Same rule as public.messages (messages_payload_required).
        assert.ok(message.kind === "text" || message.payload, `${message.kind} message needs a payload`);
        queued.push({ message, tenantId: tenantId ?? null });
      },
      saveNeed: async (_id, need) => {
        needs.push(need);
      },
      history: async () => [],
      saveTranscript: async (mediaId, text) => {
        transcripts.push([mediaId, text]);
      },
      businessName: async (id) => (id === NORTHSIDE ? "Northside Plumbing" : "Eastside Plumbing"),
    },
    directory: {
      matches: async () => options.matches ?? [northside],
      connect: options.connect ?? (async (_c, businessId) => {
        asked.connected = businessId;
        return { expiresAt: new Date(NOW.getTime() + 5 * 60_000).toISOString() };
      }),
    },
    understand: async () => {
      if (options.understanding instanceof Error) throw options.understanding;
      return { onTopic: true, category: null, urgent: false, title: null, summary: null, ...options.understanding };
    },
    readMedia: async (input) => {
      asked.findValve = input.findValve;
      return { parts: [], transcript: null, markedFrameUrl: null, valveAdvice: null, shutOffWontHelp: false, analysis: null, serious: false, ...options.reading };
    },
    answer: async (input) => {
      asked.note = input.note;
      return options.answer ?? "Happy to help.";
    },
    typing: async (id) => {
      typing.push(id);
    },
    now: () => NOW,
    log: { info: () => {}, warn: () => {}, error: () => {} },
  };
  return { deps, queued, needs, transcripts, asked, typing };
}

const ctx = (over: Partial<TurnContext> = {}): TurnContext => ({
  conversationId: CHAT,
  waMessageId: "wamid.IN",
  isNewConversation: false,
  businessId: null,
  ...over,
});

const text = (t: string): Turn => ({ kind: "text", text: t });
const button = (id: string, title = id): Turn => ({ kind: "button", id, title });
const bodies = (queued: Queued[]) => queued.map((q) => q.message.body);
const buttonIds = (q: Queued | undefined) =>
  ((q?.message.payload?.buttons as Array<{ id: string }> | undefined) ?? []).map((b) => b.id);

const DISCLOSURE =
  "Hi, I'm Zukki, an AI assistant that finds you a local business and connects you with it. A person from the business confirms every request.";

describe("respond: first contact", () => {
  it("discloses the AI, then asks what they need when the message is unclear (01, 02)", async () => {
    const { deps, queued } = setup();
    await respond(deps, ctx({ isNewConversation: true }), text("hi"));
    assert.equal(queued[0]?.message.body, DISCLOSURE);
    assert.equal(queued[0]?.message.kind, "text");
    assert.equal(queued[1]?.message.kind, "interactive");
    assert.equal(queued[1]?.message.payload?.variant, "category_list");
    assert.equal(queued.length, 2);
  });

  it("answers off-topic questions with the fixed reply (14)", async () => {
    const { deps, queued } = setup({ understanding: { onTopic: false } });
    await respond(deps, ctx(), text("what's the weather tomorrow?"));
    assert.deepEqual(bodies(queued), ["I can only help you find and contact local businesses. What do you need today?"]);
  });

  it("falls back to the category list when the model is down", async () => {
    const { deps, queued } = setup({ understanding: new Error("Spark 503") });
    await respond(deps, ctx(), text("my toilet"));
    assert.equal(queued[0]?.message.payload?.variant, "category_list");
  });

  it("shows typing while the models read the message (03)", async () => {
    const { deps, typing } = setup();
    await respond(deps, ctx(), text("hi"));
    assert.deepEqual(typing, ["wamid.IN"]);
  });
});

describe("respond: the customer changes what they need", () => {
  it("switches to the new category and saves it while Zukki still has the chat", async () => {
    const { deps, needs, asked } = setup({
      facts: { category: "plumbing", urgency: "now", locationAsked: true },
      understanding: { category: "beauty", urgent: false, title: "Haircut", summary: "Needs a salon." },
    });
    await respond(deps, ctx(), text("I need a salonist"));
    assert.deepEqual(needs, [{ category: "beauty", urgency: "today", title: "Haircut", summary: "Needs a salon." }]);
    assert.match(asked.note ?? "", /needs a salon/);
  });

  it("keeps the category once a business has the request", async () => {
    const { deps, needs, asked } = setup({
      facts: { state: "offered", category: "plumbing", urgency: "now", locationAsked: true, hasLocation: true },
      understanding: { category: "beauty" },
    });
    await respond(deps, ctx(), text("also do you know a salon"));
    assert.deepEqual(needs, []);
    assert.match(asked.note ?? "", /needs a plumber/);
  });
});

describe("respond: urgent leak", () => {
  it("saves the need and sends the marked valve frame with safety buttons (04)", async () => {
    const { deps, queued, needs, asked } = setup({
      understanding: { category: "plumbing", urgent: true, title: "Toilet won't stop running", summary: "Water reaching the hallway." },
      reading: { markedFrameUrl: "https://example.supabase.co/marked.jpg" },
    });
    await respond(deps, ctx(), { kind: "media", mediaId: MEDIA, mediaType: "video", caption: null });
    assert.equal(asked.findValve, true);
    assert.deepEqual(needs, [
      { category: "plumbing", urgency: "now", title: "Toilet won't stop running", summary: "Water reaching the hallway." },
    ]);
    const safety = queued[1];
    assert.equal(safety?.message.kind, "interactive");
    assert.equal(safety?.message.body, "Let's stop the water first: turn this valve clockwise. Any outlets or cables near the water?");
    assert.equal(safety?.message.payload?.variant, "safety");
    assert.equal(safety?.message.payload?.header_image_url, "https://example.supabase.co/marked.jpg");
    assert.deepEqual(buttonIds(safety), ["safety_done", "safety_cant_find"]);
  });

  it("gives general valve advice with the same buttons when nothing was marked", async () => {
    const { deps, queued } = setup({
      understanding: { category: "plumbing", urgent: true },
      reading: { valveAdvice: "It is usually a small handle on the pipe." },
    });
    await respond(deps, ctx(), { kind: "media", mediaId: MEDIA, mediaType: "image", caption: null });
    assert.equal(queued[1]?.message.payload?.header_image_url, undefined);
    assert.match(queued[1]?.message.body ?? "", /^Let's stop the water first\. It is usually a small handle on the pipe\. Any outlets or cables near the water\?$/);
    assert.deepEqual(buttonIds(queued[1]), ["safety_done", "safety_cant_find"]);
  });

  it("tells the customer what it saw, then asks for the location, when the need is not urgent", async () => {
    const { deps, queued } = setup({
      understanding: { category: "plumbing", urgent: false },
      reading: { analysis: "Your sink drain is leaking into the bucket. Don't use the sink for now." },
    });

    await respond(deps, ctx(), { kind: "media", mediaId: MEDIA, mediaType: "video", caption: null });

    assert.deepEqual(queued.map((entry) => entry.message.kind), ["text", "text", "location_request"]);
    assert.match(queued[0]?.message.body ?? "", /looking at what you sent/);
    assert.equal(queued[1]?.message.body, "Your sink drain is leaking into the bucket. Don't use the sink for now.");
  });

  it("shows the marked valve even when the customer did not sound urgent", async () => {
    const { deps, queued } = setup({
      understanding: { category: "plumbing", urgent: false },
      reading: { analysis: "Your toilet is overflowing.", markedFrameUrl: "https://x.test/marked.jpg" },
    });

    await respond(deps, ctx(), { kind: "media", mediaId: MEDIA, mediaType: "video", caption: null });

    assert.equal(queued[2]?.message.payload?.header_image_url, "https://x.test/marked.jpg");
    assert.match(queued[2]?.message.body ?? "", /turn this valve clockwise/);
  });

  it("shows the marked valve for later without promising it stops this, and still asks for the location", async () => {
    const { deps, queued } = setup({
      understanding: { category: "plumbing", urgent: false },
      reading: { analysis: "Your drain is leaking.", markedFrameUrl: "https://x.test/marked.jpg", shutOffWontHelp: true },
    });

    await respond(deps, ctx(), { kind: "media", mediaId: MEDIA, mediaType: "video", caption: null });

    const card = queued[2];
    assert.equal(card?.message.payload?.header_image_url, "https://x.test/marked.jpg");
    assert.match(card?.message.body ?? "", /If water gets out of hand/);
    assert.doesNotMatch(card?.message.body ?? "", /to stop the water|Let's stop the water/);
    // The store reads this as a finished safety step, so nothing waits on a button.
    assert.equal(card?.message.payload?.variant, "safety_text");
    assert.equal(queued[3]?.message.kind, "location_request");
  });

  it("does not ask for the location again when the Got it button comes after it was asked", async () => {
    const { deps, queued } = setup({ facts: { category: "plumbing", urgency: "today", safety: "answered", locationAsked: true } });

    await respond(deps, ctx(), button("safety_done", "Got it"));

    assert.deepEqual(queued, []);
  });

  it("keeps the reading when it cannot tell the category, then shows the list", async () => {
    const { deps, queued } = setup({
      understanding: new Error("Spark is down"),
      reading: { analysis: "Please leave the kitchen now, I can see a cracked gas hose." },
    });

    await respond(deps, ctx(), { kind: "media", mediaId: MEDIA, mediaType: "image", caption: null });

    assert.equal(queued[1]?.message.body, "Please leave the kitchen now, I can see a cracked gas hose.");
    assert.equal(queued[2]?.message.payload?.variant, "category_list");
  });

  it("sends no reading for an off-topic message", async () => {
    const { deps, queued } = setup({
      understanding: { onTopic: false },
      reading: { analysis: "I can see a sunset." },
    });

    await respond(deps, ctx(), { kind: "media", mediaId: MEDIA, mediaType: "image", caption: null });

    assert.equal(queued.some((entry) => entry.message.body === "I can see a sunset."), false);
  });

  it("treats the need as urgent when Spark saw something serious", async () => {
    const { deps, queued } = setup({
      understanding: { category: "plumbing", urgent: false },
      reading: { serious: true, valveAdvice: "It is usually a small handle on the pipe." },
    });

    await respond(deps, ctx(), { kind: "media", mediaId: MEDIA, mediaType: "video", caption: null });

    assert.deepEqual(buttonIds(queued[1]), ["safety_done", "safety_cant_find"]);
  });

  it("sends the notice for a photo or video in any category, but not for a voice note", async () => {
    const voice = setup({ understanding: { category: "plumbing", urgent: false } });
    await respond(voice.deps, ctx(), { kind: "media", mediaId: MEDIA, mediaType: "audio", caption: null });
    assert.doesNotMatch(voice.queued[0]?.message.body ?? "", /looking at what you sent/);

    const salon = setup({ facts: { category: "beauty" }, understanding: { category: "beauty", urgent: false } });
    await respond(salon.deps, ctx(), { kind: "media", mediaId: MEDIA, mediaType: "image", caption: null });
    assert.match(salon.queued[0]?.message.body ?? "", /looking at what you sent/);
  });

  it("tells a customer in another category what it saw, and only looks for a valve in plumbing", async () => {
    const { deps, queued, asked } = setup({
      facts: { category: "auto" },
      understanding: { category: "auto", urgent: false },
      reading: { analysis: "I can see a dent in your rear bumper." },
    });

    await respond(deps, ctx(), { kind: "media", mediaId: MEDIA, mediaType: "image", caption: null });

    assert.equal(asked.findValve, false);
    assert.equal(queued[1]?.message.body, "I can see a dent in your rear bumper.");
  });

  it("gives the electrical safety step when Spark saw something serious", async () => {
    const { deps, queued } = setup({
      facts: { category: "electrical" },
      understanding: { category: "electrical", urgent: false },
      reading: { analysis: "I can see a burnt outlet. Please don't touch it.", serious: true },
    });

    await respond(deps, ctx(), { kind: "media", mediaId: MEDIA, mediaType: "image", caption: null });

    assert.equal(queued[1]?.message.body, "I can see a burnt outlet. Please don't touch it.");
    assert.equal(queued[2]?.message.payload?.variant, "safety_text");
  });

  it("never says to close a valve when that will not stop the water, and moves on to the location", async () => {
    const { deps, queued } = setup({
      understanding: { category: "plumbing", urgent: true },
      reading: { shutOffWontHelp: true },
    });

    await respond(deps, ctx(), { kind: "media", mediaId: MEDIA, mediaType: "video", caption: null });

    assert.match(queued[1]?.message.body ?? "", /Closing your water valve won't stop this/);
    assert.match(queued[1]?.message.body ?? "", /outlets or cables/);
    // The store reads this variant as a finished safety step, so the next message cannot send the valve card.
    assert.equal(queued[1]?.message.kind, "text");
    assert.equal(queued[1]?.message.payload?.variant, "safety_text");
    assert.equal(queued[2]?.message.kind, "location_request");
  });

  it("sends no valve card on the next urgent message once safety is answered", async () => {
    const { deps, queued } = setup({
      facts: { category: "plumbing", urgency: "now", safety: "answered" },
      understanding: { category: "plumbing", urgent: true },
    });

    await respond(deps, ctx(), { kind: "text", text: "It's getting worse" });

    assert.equal(queued.some((entry) => entry.message.payload?.variant === "safety"), false);
    assert.equal(queued[0]?.message.kind, "location_request");
  });

  it("stays quiet on a voice note while the safety buttons wait, but keeps the transcript", async () => {
    const { deps, queued, transcripts } = setup({
      facts: { category: "plumbing", urgency: "now", safety: "awaiting" },
      reading: { transcript: "It won't stop running and it's in the hallway" },
    });
    await respond(deps, ctx(), { kind: "media", mediaId: MEDIA, mediaType: "audio", caption: null });
    assert.deepEqual(queued, []);
    assert.deepEqual(transcripts, [[MEDIA, "It won't stop running and it's in the hallway"]]);
  });

  it("asks for the location after Done, no cables (05)", async () => {
    const { deps, queued } = setup({ facts: { category: "plumbing", urgency: "now", safety: "awaiting" } });
    await respond(deps, ctx(), button("safety_done", "Done, no cables"));
    assert.equal(queued[0]?.message.kind, "location_request");
    assert.equal(
      queued[0]?.message.body,
      "Good, the water is off. Now share your location so I can find a plumber who is open near you. The business only sees the exact address after you approve a visit.",
    );
  });

  it("gives simpler steps, then asks for the location, after I can't find it", async () => {
    const { deps, queued } = setup({ facts: { category: "plumbing", urgency: "now", safety: "awaiting" } });
    await respond(deps, ctx(), button("safety_cant_find", "I can't find it"));
    assert.equal(queued[0]?.message.kind, "text");
    assert.match(queued[0]?.message.body ?? "", /main shut-off/);
    assert.equal(queued[1]?.message.kind, "location_request");
  });

  it("puts electrical safety first, then asks for the location", async () => {
    const { deps, queued } = setup({ understanding: { category: "electrical", urgent: true } });
    await respond(deps, ctx(), text("sparks from the outlet"));
    assert.match(queued[0]?.message.body ?? "", /emergency services/);
    assert.equal(queued[1]?.message.kind, "location_request");
  });
});

describe("respond: matching", () => {
  it("says it is looking, then suggests the best match (06, 07)", async () => {
    const { deps, queued } = setup({ facts: { category: "plumbing", urgency: "now", safety: "answered", locationAsked: true, hasLocation: true } });
    await respond(deps, ctx(), { kind: "location" });
    assert.equal(queued[0]?.message.body, "Thanks. I'm finding a plumber who is open near you.");
    const card = queued[1];
    assert.equal(card?.message.kind, "interactive");
    assert.equal(
      card?.message.body,
      "★ 4.9 (128) · 1.2 km · open now\n\nVisit: $45\nNight fee (10 PM–7 AM): +$25\nLeak repair: from $60\nCan arrive: in about 40 min",
    );
    assert.deepEqual(card?.message.payload, {
      variant: "suggest_business",
      business_id: NORTHSIDE,
      header_text: "Northside Plumbing",
      footer: "Closest plumber taking night jobs right now",
      buttons: [
        { id: `connect:${NORTHSIDE}`, title: "Connect me" },
        { id: "another_option", title: "Show another option" },
      ],
    });
  });

  it("says so when nobody is open nearby", async () => {
    const { deps, queued } = setup({ facts: { category: "plumbing", hasLocation: true }, matches: [] });
    await respond(deps, ctx(), { kind: "location" });
    assert.match(queued[1]?.message.body ?? "", /couldn't find a plumber who is open near you/);
  });

  it("asks what they need when a location comes before anything else", async () => {
    const { deps, queued } = setup({ facts: { hasLocation: true } });
    await respond(deps, ctx(), { kind: "location" });
    assert.equal(queued[0]?.message.payload?.variant, "category_list");
  });

  it("shows the next business for Show another option", async () => {
    const eastside = { ...northside, businessId: EASTSIDE, name: "Eastside Plumbing", shortName: "Eastside" };
    const { deps, queued } = setup({ facts: { category: "plumbing", hasLocation: true }, matches: [eastside] });
    await respond(deps, ctx(), button("another_option", "Show another option"));
    assert.equal(queued[0]?.message.payload?.business_id, EASTSIDE);
  });

  it("connects and says how long the business has to accept (08)", async () => {
    const { deps, queued, asked } = setup({ facts: { category: "plumbing", urgency: "now", hasLocation: true } });
    await respond(deps, ctx(), button(`connect:${NORTHSIDE}`, "Connect me"));
    assert.equal(asked.connected, NORTHSIDE);
    assert.deepEqual(bodies(queued), ["I sent your request to Northside Plumbing. They have up to 5 minutes to accept."]);
  });

  it("explains instead of failing when a request is already out", async () => {
    const { deps, queued } = setup({
      facts: { category: "plumbing", state: "offered", hasLocation: true },
      connect: async () => {
        throw new Error("duplicate key value violates unique constraint");
      },
    });
    await respond(deps, ctx(), button(`connect:${EASTSIDE}`, "Connect me"));
    assert.match(queued[0]?.message.body ?? "", /already with a business/);
  });
});

describe("respond: categories from the list", () => {
  it("goes straight to the location for everyday categories", async () => {
    const { deps, queued, needs } = setup();
    await respond(deps, ctx(), button("cat_food", "Food and drinks"));
    assert.deepEqual(needs, [{ category: "food", urgency: "today", title: null, summary: null }]);
    assert.equal(queued[0]?.message.kind, "location_request");
    assert.match(queued[0]?.message.body ?? "", /^Share your location so I can find a place that is open near you\./);
  });

  it("asks what is going on for home categories", async () => {
    const { deps, queued, needs } = setup();
    await respond(deps, ctx(), button("cat_plumbing", "Plumbing"));
    assert.deepEqual(needs, [{ category: "plumbing", urgency: "now", title: null, summary: null }]);
    assert.match(queued[0]?.message.body ?? "", /photo, a video or a voice note/);
  });

  it("asks for details for Something else", async () => {
    const { deps, queued, needs } = setup();
    await respond(deps, ctx(), button("cat_other", "Something else"));
    assert.deepEqual(needs, []);
    assert.match(queued[0]?.message.body ?? "", /Tell me what you need/);
  });
});

describe("respond: free questions", () => {
  it("lets Spark answer once the location was asked for, with the step in the note", async () => {
    const { deps, queued, asked } = setup({
      facts: { category: "plumbing", urgency: "now", safety: "answered", locationAsked: true },
      answer: "Tap Send location below and I'll find someone.",
    });
    await respond(deps, ctx(), text("how much does it cost?"));
    assert.deepEqual(bodies(queued), ["Tap Send location below and I'll find someone."]);
    assert.match(asked.note ?? "", /location/i);
  });

  it("asks for the location for a non-urgent need", async () => {
    const { deps, queued } = setup({ understanding: { category: "beauty", urgent: false } });
    await respond(deps, ctx(), text("I need a haircut today"));
    assert.equal(queued[0]?.message.kind, "location_request");
    assert.match(queued[0]?.message.body ?? "", /salon/);
  });
});

describe("respond: business chat open", () => {
  it("stays quiet while the owner chats", async () => {
    const { deps, queued } = setup();
    await respond(deps, ctx({ businessId: NORTHSIDE }), text("ok see you soon"));
    assert.deepEqual(queued, []);
  });

  it("comes back when the customer types Zukki, in the business's chat (15)", async () => {
    const { deps, queued } = setup();
    await respond(deps, ctx({ businessId: NORTHSIDE }), text("Zukki"));
    assert.deepEqual(queued, [
      {
        message: { kind: "text", body: "I'm here. Your chat with Northside Plumbing stays open. What do you need?" },
        tenantId: NORTHSIDE,
      },
    ]);
  });
});

describe("respond: failures", () => {
  it("asks for the file again when the download failed", async () => {
    const { deps, queued } = setup();
    await respond(deps, ctx(), { kind: "media_failed" });
    assert.match(queued[0]?.message.body ?? "", /couldn't open that file/);
  });

  it("queues an apology when a step throws", async () => {
    const { deps, queued } = setup({ facts: { category: "plumbing", hasLocation: true } });
    deps.directory.matches = async () => {
      throw new Error("db down");
    };
    await respond(deps, ctx(), { kind: "location" });
    assert.match(queued.at(-1)?.message.body ?? "", /something went wrong on my side/);
  });
});

describe("respond: need picked from the category list", () => {
  it("saves the title and summary from the description, keeping the chosen category and urgency", async () => {
    const { deps, needs } = setup({
      facts: { category: "plumbing", urgency: "now" },
      understanding: { category: "plumbing", urgent: false, title: "Kitchen sink leaking", summary: "Leak under the cabinet, water on the floor." },
    });
    await respond(deps, ctx(), text("My kitchen sink is leaking under the cabinet"));
    assert.deepEqual(needs, [
      { category: "plumbing", urgency: "now", title: "Kitchen sink leaking", summary: "Leak under the cabinet, water on the floor." },
    ]);
  });

  it("keeps the title the request already has when the customer writes again", async () => {
    const { deps, needs } = setup({
      facts: { category: "plumbing", urgency: "now", hasTitle: true },
      understanding: { category: "plumbing", title: "How long will it take", summary: "Asks for an arrival time." },
    });
    await respond(deps, ctx(), text("how long?"));
    assert.deepEqual(needs, []);
  });

  it("saves nothing when the description gives no title", async () => {
    const { deps, needs } = setup({ facts: { category: "plumbing", urgency: "now" }, understanding: { category: "plumbing" } });
    await respond(deps, ctx(), text("help"));
    assert.deepEqual(needs, []);
  });
});
