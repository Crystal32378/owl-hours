// Spec: docs/HANDOFF-OWNER-APP.md, T4 assignment, test file 2.
// Every test builds its own service so state never leaks between tests.
// The clock and the id generator are injected so sent messages are deterministic.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { OWNER_TEXT, POLISHED_TEXT, anaMessages, conversations as mockConversations } from "../../../shared/data/mock.ts";
import type { PolishPreview } from "../../../shared/data/types.ts";
import {
  createConversationsService,
  createFakeConversationsClient,
} from "./conversationsService.ts";
import type { ConversationsClient } from "./conversationsService.ts";

const SENT_AT = "2026-10-28T00:08:00-05:00";
const NEW_MESSAGE_ID = "m_new";
const demoPreview: PolishPreview = { original: OWNER_TEXT, polished: POLISHED_TEXT, language: "English" };

function buildService(client: ConversationsClient = createFakeConversationsClient()) {
  return createConversationsService(client, { now: () => SENT_AT, newMessageId: () => NEW_MESSAGE_ID });
}

async function threadTexts(service: ReturnType<typeof buildService>) {
  return (await service.getMessages("c_ana"))?.map((message) => message.text);
}

describe("conversationsService.getConversation", () => {
  it("returns the conversation with Ana L. about the leaking toilet", async () => {
    const conversation = await buildService().getConversation("c_ana");

    assert.equal(conversation?.customerName, "Ana L.");
    assert.equal(conversation?.jobTitle, "Leaking toilet");
    assert.equal(conversation?.offerId, "req_ana");
  });

  it("returns null for an unknown id", async () => {
    assert.equal(await buildService().getConversation("nope"), null);
  });
});

describe("conversationsService.getMessages", () => {
  it("returns the demo thread before the owner replies: Zukki's summary, then the customer's question", async () => {
    const messages = await buildService().getMessages("c_ana");

    assert.deepEqual(messages, anaMessages);
  });

  it("returns null for an unknown id", async () => {
    assert.equal(await buildService().getMessages("nope"), null);
  });
});

describe("conversationsService.sendMessage with polish off (option A)", () => {
  it("returns {sent} with the text exactly as written", async () => {
    const result = await buildService().sendMessage("c_ana", OWNER_TEXT, { polish: false });

    assert.deepEqual(result, {
      sent: {
        id: NEW_MESSAGE_ID,
        from: "owner",
        text: OWNER_TEXT,
        sentAt: SENT_AT,
        delivery: "as_written",
      },
    });
  });

  it("appends the sent message at the end of the thread", async () => {
    const service = buildService();
    const before = (await service.getMessages("c_ana")) ?? [];

    await service.sendMessage("c_ana", OWNER_TEXT, { polish: false });

    const after = await service.getMessages("c_ana");
    assert.equal(after?.length, before.length + 1);
    assert.deepEqual(after?.slice(0, -1), before);
    assert.equal(after?.at(-1)?.delivery, "as_written");
    assert.equal(after?.at(-1)?.text, OWNER_TEXT);
  });
});

describe("conversationsService.sendMessage with polish on (option B)", () => {
  it("in the demo, does not greet twice", async () => {
    const result = await buildService().sendMessage("c_ana", "hi ana, mario ya va", { polish: true });

    assert.equal(result && "polished" in result ? result.polished : null, "Hi ana, mario ya va.");
  });

  it("in the demo, gives any other message a greeting and tidy punctuation", async () => {
    const result = await buildService().sendMessage("c_ana", "mario ya va llega en 40", { polish: true });

    assert.deepEqual(result, { original: "mario ya va llega en 40", polished: "Hi Ana, Mario ya va llega en 40.", language: "English" });
  });

  it("returns a PolishPreview of the owner's text and does not send", async () => {
    const result = await buildService().sendMessage("c_ana", OWNER_TEXT, { polish: true });

    assert.deepEqual(result, { original: OWNER_TEXT, polished: POLISHED_TEXT, language: "English" });
    assert.equal(result !== null && "sent" in result, false);
  });

  it("appends nothing to the thread", async () => {
    const service = buildService();
    const before = await service.getMessages("c_ana");

    await service.sendMessage("c_ana", OWNER_TEXT, { polish: true });

    assert.deepEqual(await service.getMessages("c_ana"), before);
  });

  it("rejects and appends nothing when Zukki cannot polish", async () => {
    const failingClient: ConversationsClient = {
      ...createFakeConversationsClient(),
      polish: async () => {
        throw new Error("polish unavailable");
      },
    };
    const service = buildService(failingClient);
    const before = await service.getMessages("c_ana");

    await assert.rejects(service.sendMessage("c_ana", OWNER_TEXT, { polish: true }), /polish unavailable/);

    assert.deepEqual(await service.getMessages("c_ana"), before);
  });
});

describe("conversationsService.sendPolishChoice", () => {
  it("'Send Zukki's' returns and appends the polished message with the owner's draft", async () => {
    const service = buildService();

    const sent = await service.sendPolishChoice("c_ana", demoPreview, "zukki");

    const expected = {
      id: NEW_MESSAGE_ID,
      from: "owner",
      text: POLISHED_TEXT,
      sentAt: SENT_AT,
      delivery: "polished",
      ownerDraft: OWNER_TEXT,
    };
    assert.deepEqual(sent, expected);
    assert.deepEqual((await service.getMessages("c_ana"))?.at(-1), expected);
  });

  it("'Send mine' returns and appends the original as option A", async () => {
    const service = buildService();

    const sent = await service.sendPolishChoice("c_ana", demoPreview, "mine");

    const expected = {
      id: NEW_MESSAGE_ID,
      from: "owner",
      text: OWNER_TEXT,
      sentAt: SENT_AT,
      delivery: "as_written",
    };
    assert.deepEqual(sent, expected);
    assert.deepEqual((await service.getMessages("c_ana"))?.at(-1), expected);
  });

  it("appends exactly one message per choice", async () => {
    const service = buildService();
    const before = (await service.getMessages("c_ana")) ?? [];

    await service.sendPolishChoice("c_ana", demoPreview, "zukki");

    assert.equal((await service.getMessages("c_ana"))?.length, before.length + 1);
  });

  it("returns null and appends nothing for an unknown conversation", async () => {
    const service = buildService();
    const before = await threadTexts(service);

    assert.equal(await service.sendPolishChoice("nope", demoPreview, "zukki"), null);
    assert.deepEqual(await threadTexts(service), before);
  });
});

describe("conversationsService unknown conversation", () => {
  it("sendMessage returns null with polish off or on and creates no thread", async () => {
    const service = buildService();

    assert.equal(await service.sendMessage("nope", OWNER_TEXT, { polish: false }), null);
    assert.equal(await service.sendMessage("nope", OWNER_TEXT, { polish: true }), null);
    assert.equal(await service.getMessages("nope"), null);
  });
});

describe("conversationsService isolation", () => {
  it("does not mutate the shared mock: a fresh instance still sees the seeded thread", async () => {
    const before = await buildService().getMessages("c_ana");
    await buildService().sendMessage("c_ana", OWNER_TEXT, { polish: false });

    const fresh = buildService();

    assert.deepEqual(await fresh.getMessages("c_ana"), before);
    assert.equal(mockConversations.find((conversation) => conversation.id === "c_ana")?.lastMessage.id, "m5");
  });
});
