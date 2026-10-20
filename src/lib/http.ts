/**
 * fetch with timeout, retries and exponential backoff + jitter.
 * Retries on network errors, timeouts, 429 and 5xx. Honors Retry-After.
 */
export class HttpError extends Error {
  constructor(
    message: string,
    public status: number,
    public body?: string,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

export interface RequestOpts {
  timeoutMs?: number;
  retries?: number;
  headers?: Record<string, string>;
  method?: string;
  body?: string;
  /** Called after each failed attempt; useful for counting attempts. */
  onAttempt?: (attempt: number, err: unknown) => void;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function backoffMs(attempt: number, baseMs = 500, maxMs = 15_000): number {
  const exp = Math.min(maxMs, baseMs * 2 ** attempt);
  return Math.round(exp / 2 + Math.random() * (exp / 2));
}

function retryable(err: unknown): boolean {
  if (err instanceof HttpError) return err.status === 429 || err.status >= 500;
  return true; // network error / abort / timeout
}

export async function request(url: string, opts: RequestOpts = {}): Promise<Response> {
  const { timeoutMs = 12_000, retries = 2, headers = {}, method = "GET", body } = opts;
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, {
        method,
        body,
        headers: { "user-agent": "solbrief-bot/1.0 (+https://github.com/kyledev223/solbrief)", ...headers },
        signal: AbortSignal.timeout(timeoutMs),
        cache: "no-store",
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        const err = new HttpError(`HTTP ${res.status} for ${new URL(url).host}${new URL(url).pathname}`, res.status, text.slice(0, 500));
        if (res.status === 429) {
          const ra = Number(res.headers.get("retry-after"));
          if (ra > 0 && ra <= 30 && attempt < retries) {
            opts.onAttempt?.(attempt + 1, err);
            await sleep(ra * 1000);
            continue;
          }
        }
        throw err;
      }
      return res;
    } catch (err) {
      lastErr = err;
      opts.onAttempt?.(attempt + 1, err);
      if (attempt === retries || !retryable(err)) break;
      await sleep(backoffMs(attempt));
    }
  }
  throw lastErr;
}

export async function getJson<T = unknown>(url: string, opts?: RequestOpts): Promise<T> {
  const res = await request(url, opts);
  return (await res.json()) as T;
}

export async function getText(url: string, opts?: RequestOpts): Promise<string> {
  const res = await request(url, opts);
  return res.text();
}

export async function postJson<T = unknown>(url: string, payload: unknown, opts: RequestOpts = {}): Promise<T> {
  const res = await request(url, {
    ...opts,
    method: "POST",
    body: JSON.stringify(payload),
    headers: { "content-type": "application/json", ...(opts.headers ?? {}) },
  });
  return (await res.json()) as T;
}

/** Run async work over items with bounded concurrency, preserving order. */
export async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T, i: number) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return out;
}

export const chunk = <T,>(arr: T[], size: number): T[][] =>
  Array.from({ length: Math.ceil(arr.length / size) }, (_, i) => arr.slice(i * size, i * size + size));

export { sleep };
