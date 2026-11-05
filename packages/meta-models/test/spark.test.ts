// Muse Spark chat completions: images, tools and structured output.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createMetaClient } from "../src/client.ts";
import { createChatCompletion, imagePart, textPart, understandMedia } from "../src/spark.ts";
import { fakeFetch, jsonResponse } from "./fake-fetch.ts";

describe("createChatCompletion", () => {
  it("posts to /chat/completions with the Spark model and returns the first choice", async () => {
    const fetch = fakeFetch(() =>
      jsonResponse({
        choices: [
          {
            finish_reason: "tool_calls",
            message: {
              role: "assistant",
              content: null,
              tool_calls: [
                { id: "call_1", type: "function", function: { name: "get_price_rules", arguments: '{"item":"toilet"}' } },
              ],
            },
          },
        ],
      }),
    );
    const client = createMetaClient({ apiKey: "k", fetch: fetch.fn });

    const choice = await createChatCompletion(client, {
      messages: [{ role: "user", content: [textPart("Leak!"), imagePart("data:image/jpeg;base64,AA")] }],
      tools: [
        {
          type: "function",
          function: { name: "get_price_rules", description: "prices", parameters: { type: "object", properties: {} } },
        },
      ],
    });

    assert.equal(choice.finishReason, "tool_calls");
    assert.equal(choice.message.tool_calls?.[0]?.function.name, "get_price_rules");
    const body = fetch.calls[0]?.json as Record<string, unknown>;
    assert.equal(fetch.calls[0]?.url, "https://api.meta.ai/v1/chat/completions");
    assert.equal(body.model, "muse-spark-1.3");
    assert.deepEqual(body.messages, [
      {
        role: "user",
        content: [
          { type: "text", text: "Leak!" },
          { type: "image_url", image_url: { url: "data:image/jpeg;base64,AA" } },
        ],
      },
    ]);
  });

  it("rejects a response with no choices", async () => {
    const fetch = fakeFetch(() => jsonResponse({ choices: [] }));
    const client = createMetaClient({ apiKey: "k", fetch: fetch.fn });
    await assert.rejects(createChatCompletion(client, { messages: [] }), /no choices/);
  });
});

describe("understandMedia", () => {
  const SCHEMA = { type: "object", properties: { problem: { type: "string" } } };
  const reply = (text: string) =>
    jsonResponse({ output: [{ type: "reasoning" }, { type: "message", content: [{ type: "output_text", text }] }] });

  it("sends a video to Spark over the Responses API and answers its JSON text", async () => {
    const fetch = fakeFetch(() => reply('{"problem":"overflowing toilet"}'));
    const client = createMetaClient({ apiKey: "k", fetch: fetch.fn });

    const text = await understandMedia(client, {
      prompt: "What is wrong?",
      mediaType: "video",
      mediaUrl: "data:video/mp4;base64,AAAA",
      schemaName: "media_triage",
      schema: SCHEMA,
    });

    assert.equal(text, '{"problem":"overflowing toilet"}');
    assert.equal(fetch.calls[0]?.url, "https://api.meta.ai/v1/responses");
    assert.deepEqual(fetch.calls[0]?.json, {
      model: "muse-spark-1.3",
      max_output_tokens: 16000,
      store: false,
      text: { format: { type: "json_schema", name: "media_triage", schema: SCHEMA, strict: true } },
      input: [
        {
          type: "message",
          role: "user",
          content: [
            { type: "input_text", text: "What is wrong?" },
            { type: "input_video", video_url: "data:video/mp4;base64,AAAA" },
          ],
        },
      ],
    });
  });

  it("sends a photo as an image part", async () => {
    const fetch = fakeFetch(() => reply("{}"));
    const client = createMetaClient({ apiKey: "k", fetch: fetch.fn });

    await understandMedia(client, {
      prompt: "What is wrong?",
      mediaType: "image",
      mediaUrl: "data:image/jpeg;base64,AAAA",
      schemaName: "media_triage",
      schema: SCHEMA,
    });

    const [message] = (fetch.calls[0]?.json as { input: { content: unknown[] }[] }).input;
    assert.deepEqual(message?.content[1], { type: "input_image", image_url: "data:image/jpeg;base64,AAAA" });
  });

  it("fails when Spark answers without text", async () => {
    const fetch = fakeFetch(() => jsonResponse({ output: [{ type: "reasoning" }] }));
    const client = createMetaClient({ apiKey: "k", fetch: fetch.fn });

    await assert.rejects(
      understandMedia(client, { prompt: "p", mediaType: "image", mediaUrl: "u", schemaName: "n", schema: SCHEMA }),
      /no text/,
    );
  });
});
