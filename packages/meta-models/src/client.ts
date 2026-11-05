// Meta Model API client. One base URL, per-model modules on top.
// Endpoints and model IDs follow dev.meta.ai/docs (checked 2026-10-28).
export const META_MODEL_BASE_URL = "https://api.meta.ai/v1";

// Covers the whole call, including reading a streamed body. A free Spark
// answer with tools has taken ~20 s; anything past this is treated as hung.
export const META_TIMEOUT_MS = 60_000;

export function requireApiKey(): string {
  const key = process.env.META_MODEL_API_KEY;
  if (!key) {
    throw new Error("Missing META_MODEL_API_KEY");
  }
  return key;
}

export class MetaApiError extends Error {
  readonly status: number;
  readonly type: string | null;

  constructor(status: number, type: string | null, message: string) {
    super(message);
    this.name = "MetaApiError";
    this.status = status;
    this.type = type;
  }
}

export type MetaClientOptions = {
  apiKey?: string;
  baseUrl?: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
};

export type MetaClient = {
  post: (path: string, body: BodyInit, headers?: Record<string, string>) => Promise<Response>;
  postJson: (path: string, body: unknown) => Promise<unknown>;
};

export function createMetaClient(options: MetaClientOptions = {}): MetaClient {
  const apiKey = options.apiKey ?? requireApiKey();
  if (!apiKey) {
    throw new Error("Missing META_MODEL_API_KEY");
  }
  const baseUrl = options.baseUrl ?? META_MODEL_BASE_URL;
  const fetchImpl = options.fetch ?? fetch;
  const timeoutMs = options.timeoutMs ?? META_TIMEOUT_MS;

  async function post(path: string, body: BodyInit, headers: Record<string, string> = {}): Promise<Response> {
    const signal = AbortSignal.timeout(timeoutMs);
    const response = await withTimeout(path, signal, () =>
      fetchImpl(`${baseUrl}${path}`, {
        method: "POST",
        headers: { authorization: `Bearer ${apiKey}`, ...headers },
        body,
        signal,
      }),
    );
    if (!response.ok) {
      throw await toApiError(response);
    }
    return response;
  }

  async function postJson(path: string, body: unknown): Promise<unknown> {
    const response = await post(path, JSON.stringify(body), {
      "content-type": "application/json",
      accept: "application/json",
    });
    return response.json();
  }

  // Turns the abort into an error that names the call and the limit.
  async function withTimeout<T>(path: string, signal: AbortSignal, run: () => Promise<T>): Promise<T> {
    try {
      return await run();
    } catch (error) {
      if (signal.aborted) {
        throw new Error(`Meta API ${path} timed out after ${timeoutMs} ms`);
      }
      throw error;
    }
  }

  return { post, postJson };
}

async function toApiError(response: Response): Promise<MetaApiError> {
  const text = await response.text();
  try {
    const parsed = JSON.parse(text) as { error?: { type?: string; message?: string } };
    const message = parsed.error?.message ?? text;
    return new MetaApiError(response.status, parsed.error?.type ?? null, `Meta API ${response.status}: ${message}`);
  } catch {
    return new MetaApiError(response.status, null, `Meta API ${response.status}: ${text.slice(0, 500)}`);
  }
}
