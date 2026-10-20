import { after } from "next/server";
import { z } from "zod";
import { LIMITS } from "@/config/site";
import { fail, json, limited, parseBody, requireViewer } from "@/lib/api";
import { geminiDeps } from "@/lib/brief/generate";
import { gatherResearch, runResearch } from "@/lib/brief/research";
import { getStore } from "@/lib/db";
import { env } from "@/lib/env";
import { dailyLimit } from "@/lib/tiers";

export const maxDuration = 300;

const Body = z.object({
  query: z
    .string()
    .trim()
    .min(2)
    .max(LIMITS.researchQueryMaxChars)
    .regex(/^[\p{L}\p{N} .$_\-()]+$/u, "letters, numbers, spaces and . $ _ - ( ) only"),
});

export async function GET(req: Request) {
  const g = await requireViewer(req, { minTier: "WHALE" });
  if (g.error) return g.error;
  const reports = await getStore().listResearch(g.viewer.wallet!, 30);
  return json({ reports: reports.map((r) => ({ id: r.id, query: r.query, status: r.status, createdAt: r.createdAt, title: r.content?.title ?? null, error: r.error })) });
}

/** Deep Research (WHALE). Returns immediately; the report is generated in the background. */
export async function POST(req: Request) {
  const g = await requireViewer(req, { minTier: "WHALE", write: true });
  if (g.error) return g.error;
  const wallet = g.viewer.wallet!;
  const rl = limited(req, "research", wallet);
  if (rl) return rl;
  const body = await parseBody(req, Body);
  if ("error" in body) return body.error;

  const deps = geminiDeps();
  if (!deps.available) return fail(503, "Deep Research is offline (LLM not configured)");
  const store = getStore();
  const limit = dailyLimit(g.viewer.tier, "research");
  const quota = await store.consumeUsage(wallet, "research", limit);
  if (!quota.allowed) return fail(429, `Daily limit reached (${limit} reports). Resets at 00:00 UTC.`, { used: quota.used, limit });

  const query = body.data.query;
  const id = await store.createResearch(wallet, query);

  after(async () => {
    try {
      const gathered = await gatherResearch(query, store, { rpcUrl: env.rpcUrl, jupiterKey: env.jupiterKey, coingeckoKey: env.coingeckoKey });
      const report = await runResearch(query, gathered, deps);
      await store.updateResearch(id, { status: "complete", content: report, completedAt: new Date().toISOString() });
    } catch (err) {
      console.error("[research]", err);
      await store.refundUsage(wallet, "research").catch(() => undefined);
      await store.updateResearch(id, { status: "failed", error: err instanceof Error ? err.message.slice(0, 300) : String(err), completedAt: new Date().toISOString() });
    }
  });

  return json({ id, status: "pending", usage: { used: quota.used, limit } }, { status: 202 });
}
