// Logs what this deployment's Meta key can use, once at startup. A key from a team without a model
// gets 404 model_not_found on every call, and the host's variables cannot be read from outside.
// The fingerprint tells two keys apart without showing either; nothing here can stop the API.
// Docs: https://dev.meta.ai/docs/models.md
import { createHash } from "node:crypto";
import { META_MODEL_BASE_URL, SAM_MODEL, SPARK_MODEL, VOICE_MODEL } from "@owl-hours/meta-models";

const NEEDED_MODELS = [SPARK_MODEL, SAM_MODEL, VOICE_MODEL];
const CHECK_TIMEOUT_MS = 10_000;

type Log = { log: (line: string) => void; warn: (line: string) => void };

export async function logMetaModelAccess(
  env: Record<string, string | undefined>,
  log: Log,
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  const key = env.META_MODEL_API_KEY;
  if (!key) return;
  const prefix = `Meta models: key length ${key.length}, fingerprint ${fingerprintOf(key)}`;
  try {
    const response = await fetchImpl(`${META_MODEL_BASE_URL}/models`, {
      headers: { authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(CHECK_TIMEOUT_MS),
    });
    if (!response.ok) {
      log.warn(`${prefix}: HTTP ${response.status} listing models`);
      return;
    }
    reportModels(prefix, await modelIdsOf(response), log);
  } catch (error) {
    log.warn(`${prefix}: could not list models: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function reportModels(prefix: string, ids: string[], log: Log): void {
  const missing = NEEDED_MODELS.filter((model) => !ids.includes(model));
  const seen = `sees ${ids.join(", ") || "none"}`;
  if (missing.length > 0) log.warn(`${prefix}: ${seen}; missing ${missing.join(", ")}`);
  else log.log(`${prefix}: ${seen}`);
}

async function modelIdsOf(response: Response): Promise<string[]> {
  const body = (await response.json()) as { data?: { id?: unknown }[] };
  return (body.data ?? []).flatMap(({ id }) => (typeof id === "string" ? [id] : []));
}

function fingerprintOf(key: string): string {
  return createHash("sha256").update(key).digest("hex").slice(0, 8);
}
