// HTTP access to the owner API (`/v1/owner`, docs/API.md). Every answer is
// `{ success, data }` or `{ success: false, error: { code, message } }`.

export type OwnerApiConfig =
  | { mode: 'demo' }
  | { mode: 'live'; apiUrl: string; supabaseUrl: string; anonKey: string };

export type OwnerApiOptions = {
  apiUrl: string;
  getAccessToken: () => Promise<string>;
  fetch?: typeof fetch;
};

export type OwnerApi = {
  get(path: string): Promise<unknown>;
  post(path: string, body?: unknown): Promise<unknown>;
};

// The resource edits (PATCH a record, PUT a whole list, DELETE a record) beside reads and actions.
export type OwnerEditApi = OwnerApi & {
  patch(path: string, body: unknown): Promise<unknown>;
  put(path: string, body: unknown): Promise<unknown>;
  delete(path: string): Promise<unknown>;
};

export class OwnerApiError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

const LOCAL_HOSTS = ['localhost', '127.0.0.1', '[::1]'];

// Live mode needs the API URL and both public Supabase variables; anything
// missing or not https (localhost aside) runs the demo.
export function resolveOwnerApiConfig(input: { apiUrl?: string | undefined; supabaseUrl?: string | undefined; anonKey?: string | undefined }): OwnerApiConfig {
  const { apiUrl, supabaseUrl, anonKey } = input;
  if (!apiUrl || !supabaseUrl || !anonKey) return { mode: 'demo' };
  if (!isSafeUrl(apiUrl) || !isSafeUrl(supabaseUrl)) return { mode: 'demo' };
  return { mode: 'live', apiUrl: withoutTrailingSlash(apiUrl), supabaseUrl: withoutTrailingSlash(supabaseUrl), anonKey };
}

export function createOwnerApi(options: OwnerApiOptions): OwnerEditApi {
  const send = options.fetch ?? fetch;
  const baseUrl = `${withoutTrailingSlash(options.apiUrl)}/v1/owner`;

  async function request(method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE', path: string, body?: unknown): Promise<unknown> {
    const headers: Record<string, string> = { Authorization: `Bearer ${await options.getAccessToken()}` };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    const response = await send(`${baseUrl}${path}`, {
      method,
      headers,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    return unwrap(response);
  }

  return {
    get: path => request('GET', path),
    post: (path, body) => request('POST', path, body),
    patch: (path, body) => request('PATCH', path, body),
    put: (path, body) => request('PUT', path, body),
    delete: path => request('DELETE', path),
  };
}

async function unwrap(response: Response): Promise<unknown> {
  const result: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const error = isRecord(result) && isRecord(result.error) ? result.error : {};
    throw new OwnerApiError(response.status, String(error.code ?? 'request_failed'), String(error.message ?? `Owner API answered ${response.status}`));
  }
  if (!isRecord(result) || !('data' in result)) {
    throw new OwnerApiError(response.status, 'invalid_response', 'Owner API answered without data');
  }
  return result.data;
}

function isSafeUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || (url.protocol === 'http:' && LOCAL_HOSTS.includes(url.hostname));
  } catch {
    return false;
  }
}

function withoutTrailingSlash(value: string): string {
  return value.replace(/\/$/, '');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
