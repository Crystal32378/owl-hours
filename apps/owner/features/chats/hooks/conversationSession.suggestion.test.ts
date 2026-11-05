// Spec: docs/HANDOFF-OWNER-APP.md, T5 assignment, test file 4, with operator answer 10: the loaded chat
// exposes the job id ("View job and evidence") and the suggested quote text (SuggestionRow), or neither.
// A failed suggestion lookup means "no suggestion": the chat still loads.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { ChatView } from "../lib/chatView.ts";
import { createConversationsService, createFakeConversationsClient } from "../services/conversationsService.ts";
import type { ConversationsClient } from "../services/conversationsService.ts";
import { createConversationSession } from "./conversationSession.ts";

async function loadedChat(conversationId: string, overrides: Partial<ConversationsClient> = {}): Promise<ChatView> {
  const client = { ...createFakeConversationsClient(), ...overrides };
  const session = createConversationSession(createConversationsService(client), conversationId);
  await session.load();

  const snapshot = session.getSnapshot();
  assert.equal(snapshot.status, "ready");
  return (snapshot as { status: "ready"; chat: ChatView }).chat;
}

describe("conversationSession suggestion", () => {
  it("exposes job_ana and $130–160 for Ana's conversation", async () => {
    const chat = await loadedChat("c_ana");

    assert.equal(chat.jobId, "job_ana");
    assert.equal(chat.suggestedQuoteText, "$130–160");
  });

  it("exposes neither for a conversation with no job: c_carlos", async () => {
    const chat = await loadedChat("c_carlos");

    assert.equal(chat.jobId, null);
    assert.equal(chat.suggestedQuoteText, null);
  });

  // odd/tasks/owner-chat-live-fixes.md S2: the demo keeps offering the quote only where it did.
  it("offers the quote entry for Ana's job and none for Carlos's chat without a job", async () => {
    assert.equal((await loadedChat("c_ana")).canSendQuote, true);
    assert.equal((await loadedChat("c_carlos")).canSendQuote, false);
  });

  it("still loads the chat, without a suggestion, when the suggestion lookup fails", async () => {
    const failingLookup = async () => {
      throw new Error("suggestion lookup failed");
    };

    const chat = await loadedChat("c_ana", { findQuoteSuggestion: failingLookup });

    assert.equal(chat.jobId, null);
    assert.equal(chat.suggestedQuoteText, null);
    assert.equal(chat.customerName, "Ana L.");
  });
});
