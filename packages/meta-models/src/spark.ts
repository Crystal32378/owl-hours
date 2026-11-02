// Muse Spark over the OpenAI-compatible Chat Completions endpoint:
// image input, function tools and json_schema structured output.
import { z } from "zod";
import type { MetaClient } from "./client.ts";

export const SPARK_MODEL = "muse-spark-1.3";

export type ContentPart = { type: "text"; text: string } | { type: "image_url"; image_url: { url: string } };

export type ToolCall = {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
};

export type AssistantMessage = {
  role: "assistant";
  content: string | null;
  tool_calls?: ToolCall[];
};

export type ChatMessage =
  | { role: "system"; content: string }
  | { role: "user"; content: string | ContentPart[] }
  | AssistantMessage
  | { role: "tool"; tool_call_id: string; content: string };

export type ToolSpec = {
  type: "function";
  function: { name: string; description: string; parameters: Record<string, unknown> };
};

export type ResponseFormat = {
  type: "json_schema";
  json_schema: { name: string; schema: Record<string, unknown> };
};

export type ChatRequest = {
  messages: ChatMessage[];
  tools?: ToolSpec[];
  responseFormat?: ResponseFormat;
  temperature?: number;
  model?: string;
};

export type ChatChoice = { finishReason: string; message: AssistantMessage };

export function textPart(text: string): ContentPart {
  return { type: "text", text };
}

export function imagePart(url: string): ContentPart {
  return { type: "image_url", image_url: { url } };
}

const choiceSchema = z.object({
  finish_reason: z.string().nullable(),
  message: z.object({
    role: z.literal("assistant"),
    content: z.string().nullable().default(null),
    tool_calls: z
      .array(
        z.object({
          id: z.string(),
          type: z.literal("function"),
          function: z.object({ name: z.string(), arguments: z.string() }),
        }),
      )
      .optional(),
  }),
});

const completionSchema = z.object({ choices: z.array(choiceSchema) });

export async function createChatCompletion(client: MetaClient, request: ChatRequest): Promise<ChatChoice> {
  const body = {
    model: request.model ?? SPARK_MODEL,
    messages: request.messages,
    ...(request.tools && request.tools.length > 0 ? { tools: request.tools } : {}),
    ...(request.responseFormat ? { response_format: request.responseFormat } : {}),
    ...(request.temperature === undefined ? {} : { temperature: request.temperature }),
  };
  const parsed = completionSchema.parse(await client.postJson("/chat/completions", body));
  const first = parsed.choices[0];
  if (!first) {
    throw new Error("Spark returned no choices");
  }
  const toolCalls = first.message.tool_calls;
  return {
    finishReason: first.finish_reason ?? "stop",
    message: {
      role: "assistant",
      content: first.message.content,
      ...(toolCalls && toolCalls.length > 0 ? { tool_calls: toolCalls } : {}),
    },
  };
}

export type UnderstandMediaInput = {
  prompt: string;
  mediaType: "image" | "video";
  // Public URL or base64 data URL (https://dev.meta.ai/docs/video-understanding).
  mediaUrl: string;
  schemaName: string;
  schema: Record<string, unknown>;
};

// Reasoning shares this budget with the answer, which a low limit leaves empty.
const UNDERSTAND_MAX_OUTPUT_TOKENS = 4000;

const responseSchema = z.object({
  output: z.array(
    z.object({
      type: z.string(),
      content: z.array(z.object({ text: z.string().optional() })).optional(),
    }),
  ),
});

// Spark reading a whole photo or video over the Responses API, the path the docs give for video.
// Answers the JSON text the schema asked for.
export async function understandMedia(client: MetaClient, input: UnderstandMediaInput): Promise<string> {
  const response = responseSchema.parse(
    await client.postJson("/responses", {
      model: SPARK_MODEL,
      max_output_tokens: UNDERSTAND_MAX_OUTPUT_TOKENS,
      // A customer's media stays out of Meta's stored responses, which also refuse about 29 MB and up with a 413.
      store: false,
      text: { format: { type: "json_schema", name: input.schemaName, schema: input.schema, strict: true } },
      input: [
        {
          type: "message",
          role: "user",
          content: [{ type: "input_text", text: input.prompt }, mediaPartOf(input)],
        },
      ],
    }),
  );
  const text = response.output.find((item) => item.type === "message")?.content?.[0]?.text;
  if (!text) throw new Error("Spark answered no text for the media");
  return text;
}

function mediaPartOf(input: UnderstandMediaInput) {
  return input.mediaType === "video"
    ? { type: "input_video", video_url: input.mediaUrl }
    : { type: "input_image", image_url: input.mediaUrl };
}
