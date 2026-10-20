import { json, limited, requireViewer } from "@/lib/api";
import { geminiDeps } from "@/lib/brief/generate";
import { getTopicSection } from "@/lib/brief/topics";
import { getStore } from "@/lib/db";
import { env } from "@/lib/env";

export const maxDuration = 120;

/** The viewer's personalized sections for the latest brief (HOLDER+). */
export async function GET(req: Request) {
  const g = await requireViewer(req, { minTier: "HOLDER" });
  if (g.error) return g.error;
  const rl = limited(req, "default", g.viewer.wallet);
  if (rl) return rl;

  const store = getStore();
  const brief = await store.latestBrief();
  const topics = g.viewer.user?.topics ?? [];
  if (!brief || !topics.length) return json({ briefDate: brief?.briefDate ?? null, sections: [] });

  const deps = geminiDeps();
  const sections = [];
  for (const t of topics) {
    try {
      sections.push(await getTopicSection(store, t, brief.facts, deps, env.rpcUrl));
    } catch (err) {
      console.error("[personal]", err);
    }
  }
  const ids = new Set(sections.flatMap((s) => s.items.flatMap((i) => i.tokenIds)));
  const tokens = brief.facts.tokens.filter((t) => ids.has(t.id)).map((t) => ({ id: t.id, symbol: t.symbol, mint: t.mint, pairUrl: t.pairUrl, risk: t.risk }));
  return json({ briefDate: brief.briefDate, sections, tokens });
}
