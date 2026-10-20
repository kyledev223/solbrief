import "server-only";
import { timingSafeEqual } from "node:crypto";
import type { z } from "zod";
import { env } from "./env";
import { rateLimit } from "./rate-limit";
import { getViewer, type Viewer } from "./viewer";
import type { Tier } from "@/config/site";
import { tierAtLeast } from "./tiers";

export function json(data: unknown, init: ResponseInit = {}) {
  return Response.json(data, { ...init, headers: { "cache-control": "no-store", ...(init.headers ?? {}) } });
}

export function fail(status: number, error: string, extra: Record<string, unknown> = {}) {
  return json({ error, ...extra }, { status });
}

export function clientIp(req: Request): string {
  return req.headers.get("x-real-ip") ?? req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
}

export const RATE = {
  default: { limit: 60, windowMs: 60_000 },
  auth: { limit: 10, windowMs: 60_000 },
  ask: { limit: 8, windowMs: 60_000 },
  research: { limit: 3, windowMs: 60_000 },
  admin: { limit: 30, windowMs: 60_000 },
  cron: { limit: 10, windowMs: 60_000 },
} as const;

/** Per-IP (and per-wallet when known) limiter. Returns a 429 response or null. */
export function limited(req: Request, name: keyof typeof RATE, wallet?: string | null): Response | null {
  const { limit, windowMs } = RATE[name];
  const checks = [`${name}:ip:${clientIp(req)}`, ...(wallet ? [`${name}:w:${wallet}`] : [])];
  for (const key of checks) {
    const r = rateLimit(key, limit, windowMs);
    if (!r.ok) return fail(429, "Too many requests", { retryAfterSec: r.retryAfterSec });
  }
  return null;
}

/** CSRF defense for cookie-authenticated writes: Origin must match Host. */
export function sameOrigin(req: Request): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return req.method === "GET";
  try {
    const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

export async function parseBody<T>(req: Request, schema: z.ZodType<T>): Promise<{ data: T } | { error: Response }> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return { error: fail(400, "Invalid JSON body") };
  }
  const r = schema.safeParse(body);
  if (!r.success) return { error: fail(400, "Invalid request", { issues: r.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`) }) };
  return { data: r.data };
}

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

/** Cron routes accept `Authorization: Bearer <CRON_SECRET>` (Vercel Cron) or `x-cron-secret`. */
export function isCronAuthorized(req: Request): boolean {
  if (!env.cronSecret) return false;
  const bearer = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const header = req.headers.get("x-cron-secret");
  return Boolean((bearer && safeEqual(bearer, env.cronSecret)) || (header && safeEqual(header, env.cronSecret)));
}

type Guarded = { viewer: Viewer; error?: undefined } | { viewer?: undefined; error: Response };

/** Session + tier gate for API routes (tier always resolved server-side). */
export async function requireViewer(req: Request, opts: { minTier?: Tier; write?: boolean; admin?: boolean } = {}): Promise<Guarded> {
  if (opts.write && !sameOrigin(req)) return { error: fail(403, "Cross-origin request rejected") };
  const viewer = await getViewer();
  if (!viewer.wallet) return { error: fail(401, "Connect and sign in with your wallet first") };
  if (opts.admin && !viewer.isAdmin) return { error: fail(403, "Admin only") };
  if (opts.minTier && !tierAtLeast(viewer.tier, opts.minTier)) {
    return { error: fail(403, `Requires ${opts.minTier} tier`, { tier: viewer.tier, required: opts.minTier }) };
  }
  return { viewer };
}
