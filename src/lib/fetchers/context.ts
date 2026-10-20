import type { FetchLog } from "./types";

export type AttemptHook = (attempt: number, err: unknown) => void;

/**
 * Runs each source in isolation: timing, attempt counting and error capture.
 * A failing source returns `null` and is logged; it never throws upward.
 */
export class FetchContext {
  logs: FetchLog[] = [];

  async run<T>(
    source: string,
    fn: (onAttempt: AttemptHook) => Promise<T>,
    count: (data: T) => number = (d) => (Array.isArray(d) ? d.length : d instanceof Map ? d.size : d ? 1 : 0),
  ): Promise<T | null> {
    const started = Date.now();
    let failures = 0;
    const onAttempt: AttemptHook = () => {
      failures++;
    };
    try {
      const data = await fn(onAttempt);
      this.logs.push({ source, ok: true, durationMs: Date.now() - started, attempts: failures + 1, items: count(data) });
      return data;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logs.push({
        source,
        ok: false,
        durationMs: Date.now() - started,
        attempts: Math.max(failures, 1),
        items: 0,
        error: message.slice(0, 500),
      });
      console.warn(`[fetch] ${source} failed: ${message}`);
      return null;
    }
  }

  get failedSources() {
    return this.logs.filter((l) => !l.ok).map((l) => l.source);
  }
}
