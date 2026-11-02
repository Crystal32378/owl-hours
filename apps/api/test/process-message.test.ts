// One inbound WhatsApp message through the AI pipeline, with every model
// and media step faked.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { ChatRequest } from "@owl-hours/meta-models";
import { processMessage, type PipelineDeps } from "../src/worker/process-message.ts";

function fakeDeps(overrides: Partial<PipelineDeps> = {}) {
  const agentRequests: ChatRequest["messages"][] = [];
  const deps: PipelineDeps = {
    downloadMedia: async (mediaId) => `/tmp/${mediaId}`,
    toWav: async (path) => `${path}.wav`,
    transcribe: async () => "Water is coming out under the sink",
    triage: async () => {
      throw new Error("processMessage does not triage");
    },
    extractFrame: async (path) => `${path}.jpg`,
    toDataUrl: async (path) => `data:image/jpeg;base64,${path}`,
    markValve: async () => ({
      kind: "marked",
      markedFramePath: "/tmp/marked.jpg",
      detection: {
        frame: 0,
        objectId: 0,
        box: { x1: 1, y1: 1, x2: 2, y2: 2 },
        width: 10,
        height: 10,
        confidence: 0.9,
      },
    }),
    publishImage: async (conversationId, path) => `https://storage.example/${conversationId}${path}?token=t`,
    runAgent: async (messages) => {
      agentRequests.push(messages);
      return { reply: "Turn the valve I circled clockwise." };
    },
    ...overrides,
  };
  return { deps, agentRequests };
}

describe("processMessage", () => {
  it("transcribes a voice note and hands the transcript to the agent", async () => {
    const { deps, agentRequests } = fakeDeps();
    let boundConversation = "";
    deps.runAgent = async (messages, conversationId) => {
      agentRequests.push(messages);
      boundConversation = conversationId;
      return { reply: "Turn the valve I circled clockwise." };
    };
    const result = await processMessage({ conversationId: "c1", type: "audio", mediaId: "m1" }, deps);
    assert.equal(boundConversation, "c1", "tools are bound to the message's conversation");

    assert.equal(result.transcript, "Water is coming out under the sink");
    assert.equal(result.reply, "Turn the valve I circled clockwise.");
    assert.equal(result.valve, null);
    assert.match(JSON.stringify(agentRequests[0]), /under the sink/);
  });

  it("marks the valve on a video frame and shows Spark the real frame", async () => {
    const { deps, agentRequests } = fakeDeps();
    const result = await processMessage({ conversationId: "c1", type: "video", mediaId: "v1", caption: "help" }, deps);

    assert.equal(result.valve?.kind, "marked");
    assert.equal(result.markedFrameUrl, "https://storage.example/c1/tmp/marked.jpg?token=t", "payload 04 image link");
    const sent = JSON.stringify(agentRequests[0]);
    assert.match(sent, /data:image\/jpeg;base64,\/tmp\/v1\.jpg/);
    assert.match(sent, /help/);
    assert.match(sent, /marked/i);
  });

  it("tells the agent when the valve could not be marked", async () => {
    const { deps, agentRequests } = fakeDeps({
      markValve: async () => ({ kind: "fallback", advice: "Look under the sink." }),
      publishImage: async () => {
        throw new Error("nothing to publish");
      },
    });
    const result = await processMessage({ conversationId: "c1", type: "image", mediaId: "i1" }, deps);
    assert.match(JSON.stringify(agentRequests[0]), /could not be marked/);
    assert.equal(result.markedFrameUrl, null);
  });

  it("passes plain text straight to the agent without touching media", async () => {
    const { deps, agentRequests } = fakeDeps({
      downloadMedia: async () => {
        throw new Error("should not download");
      },
    });
    const result = await processMessage({ conversationId: "c1", type: "text", text: "Is anyone there?" }, deps);
    assert.equal(result.reply, "Turn the valve I circled clockwise.");
    assert.match(JSON.stringify(agentRequests[0]), /Is anyone there/);
  });

  it("sends the disclosure from code on the first message only", async () => {
    const { deps } = fakeDeps();
    const first = await processMessage({ conversationId: "c1", type: "text", text: "hi", firstInConversation: true }, deps);
    const later = await processMessage({ conversationId: "c1", type: "text", text: "hi" }, deps);
    assert.match(first.disclosure ?? "", /^Hi, I'm Zukki, an AI assistant/);
    assert.equal(later.disclosure, null);
  });

  it("rejects a media message with no media id", async () => {
    const { deps } = fakeDeps();
    await assert.rejects(processMessage({ conversationId: "c1", type: "audio" }, deps), /mediaId/);
  });
});
