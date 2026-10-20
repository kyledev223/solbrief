/**
 * Sliding-window rate limiter (in-memory, per server instance). It blunts
 * bursts and abuse; durable per-wallet daily quotas live in the database.
 */
interface Bucket {
  hits: number[];
}

const buckets = new Map<string, Bucket>();
let lastSweep = Date.now();

export interface RateLimitResult {
  ok: boolean;
  remaining: number;
  retryAfterSec: number;
}

export function rateLimit(key: string, limit: number, windowMs: number, now = Date.now()): RateLimitResult {
  if (now - lastSweep > 60_000) {
    for (const [k, b] of buckets) if (!b.hits.length || b.hits[b.hits.length - 1] < now - 10 * 60_000) buckets.delete(k);
    lastSweep = now;
  }
  const b = buckets.get(key) ?? { hits: [] };
  b.hits = b.hits.filter((t) => t > now - windowMs);
  if (b.hits.length >= limit) {
    buckets.set(key, b);
    return { ok: false, remaining: 0, retryAfterSec: Math.max(1, Math.ceil((b.hits[0] + windowMs - now) / 1000)) };
  }
  b.hits.push(now);
  buckets.set(key, b);
  return { ok: true, remaining: limit - b.hits.length, retryAfterSec: 0 };
}

export function resetRateLimits() {
  buckets.clear();
}
