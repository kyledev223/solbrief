import { z } from "zod";
import { LIMITS } from "@/config/site";
import { fail, json, limited, parseBody, requireViewer } from "@/lib/api";
import { askBrief } from "@/lib/brief/ask";
import { geminiDeps } from "@/lib/brief/generate";
import { getStore } from "@/lib/db";
import { dailyLimit } from "@/lib/tiers";

export const maxDuration = 60;

const Body = z.object({ question: z.string().trim().min(3).max(LIMITS.questionMaxChars) });

/** Ask the Brief — answers only from today's stored facts. HOLDER+, daily quota per wallet. */
export async function POST(req: Request) {
  const g = await requireViewer(req, { minTier: "HOLDER", write: true });
  if (g.error) return g.error;
  const wallet = g.viewer.wallet!;
  const rl = limited(req, "ask", wallet);
  if (rl) return rl;
  const body = await parseBody(req, Body);
  if ("error" in body) return body.error;

  const deps = geminiDeps();
  if (!deps.available) return fail(503, "Ask the Brief is offline (LLM not configured)");
  const store = getStore();
  const brief = await store.latestBrief();
  if (!brief) return fail(404, "No brief has been published yet");

  const limit = dailyLimit(g.viewer.tier, "ask");
  const quota = await store.consumeUsage(wallet, "ask", limit);
  if (!quota.allowed) return fail(429, `Daily limit reached (${limit} questions). Resets at 00:00 UTC.`, { used: quota.used, limit });

  try {
    const answer = await askBrief(body.data.question, brief.facts, brief.content, deps);
    await store.logAsk(wallet, brief.briefDate, body.data.question, answer).catch(() => undefined);
    const tokens = brief.facts.tokens.filter((t) => answer.tokenIds.includes(t.id)).map((t) => ({ id: t.id, symbol: t.symbol, mint: t.mint, pairUrl: t.pairUrl, risk: t.risk }));
    return json({ ...answer, tokens, briefDate: brief.briefDate, usage: { used: quota.used, limit } });
  } catch (err) {
    await store.refundUsage(wallet, "ask").catch(() => undefined);
    console.error("[ask]", err);
    return fail(503, "The model is busy (free-tier rate limit). Your question was not counted — try again in a minute.");
  }
}
