import { ANOMALY, APP_NAME } from "@/config/site";
import type { FactsPack } from "../types";
import { compactAnomaly, compactMarket, compactNews, compactToken, tokensById } from "./facts";
import type { BriefItem, SectionId } from "./schema";

export const SYSTEM_PROMPT = `You are ${APP_NAME}, an automated analyst that writes one section at a time of a daily Solana ecosystem brief.

HARD RULES — output that breaks any rule is rejected automatically:
1. Use ONLY the FACTS JSON you are given. Never introduce numbers, tokens, projects, events or links that are not in it.
2. Every number you write must appear in FACTS. You may round or abbreviate (1234567 → $1.23M, 41.26 → 41.3%). Do NOT compute new numbers (no sums, differences, ratios or averages) unless that exact number is in FACTS.
3. Every item has a "type":
   - "VERIFIED": a factual statement fully supported by the facts you cite. Put every fact id you used in "factIds" (at least one).
   - "SPECULATION": interpretation, context or possible implications. Phrase it as analysis ("may", "could indicate", "one reading is"). Cite related fact ids when relevant.
4. Never give buy/sell/hold recommendations, price predictions, price targets or return estimates. Never use "opportunity", "gem", "moon", "undervalued", "bullish", "bearish" or similar hype. Trending is not the same as good: high volume, sharp gains and new launches carry elevated risk — say so where relevant.
5. Put the id (tok:...) of every token you mention in "tokenIds". Risk flags are attached to each token automatically; if a token has entries in riskFlagsYes, state the most serious one plainly in the body.
6. Neutral, concise, plain English. Headline at most 12 words. Body 1–3 sentences. No emojis, no exclamation marks.
7. If the facts are thin, return fewer items. An empty "items" array is acceptable; padding is not.`;

interface SectionSpec {
  goal: string;
  maxItems: number;
}

export const SECTION_SPECS: Record<SectionId, SectionSpec> = {
  market: {
    goal: "Summarize market conditions: SOL price and 24h change, Solana category data, notable moves among large ecosystem tokens, and which tokens led DEX volume. Mostly VERIFIED items.",
    maxItems: 5,
  },
  launches: {
    goal: `Describe noteworthy new launches (pairs younger than ${ANOMALY.newPairHours}h with at least $${ANOMALY.newLaunchMinLiquidityUsd.toLocaleString("en-US")} liquidity). For each, state what the data shows and its risk flags. Young pairs are high risk by default.`,
    maxItems: 6,
  },
  unusual: {
    goal: `Explain each unusual volume move (24h volume more than ${ANOMALY.volumeMultiple}x the 7-day average) and liquidity move (more than ${ANOMALY.liquidityChangePct}% in 24h). State the numbers from the anomaly facts, then optionally add a SPECULATION item on what might explain it. Liquidity removals are a known rug-pull pattern; mention that where relevant without accusing anyone.`,
    maxItems: 6,
  },
  ecosystem: {
    goal: "Summarize the most relevant Solana ecosystem announcements and news. Each VERIFIED item must cite the news fact id it comes from. Skip duplicates covering the same story (cite all sources for that story on one item).",
    maxItems: 6,
  },
  why: {
    goal: "Write the 'Why it matters' analysis: connect today's verified items into 2–4 SPECULATION items about what they may mean for the Solana ecosystem. No predictions about prices. Cite the fact ids your analysis draws on.",
    maxItems: 4,
  },
};

/** The subset of facts each section is allowed to see. */
export function sectionFacts(section: SectionId, f: FactsPack, prior: Array<{ section: string; item: BriefItem }> = []): Record<string, unknown> | null {
  const byId = tokensById(f);
  const pick = (ids: string[]) => ids.map((id) => byId.get(id)).filter(Boolean).map((t) => compactToken(t!));

  switch (section) {
    case "market": {
      const m = compactMarket(f);
      if (!m.sol && !m.ecosystem.length) return null;
      return { market: m, topVolumeTokens: pick(f.topVolume), topGainers: pick(f.gainers) };
    }
    case "launches":
      return f.launches.length ? { launches: pick(f.launches), anomalies: f.anomalies.filter((a) => a.kind === "NEW_LAUNCH").map(compactAnomaly) } : null;
    case "unusual": {
      const anomalies = f.anomalies.filter((a) => a.kind !== "NEW_LAUNCH");
      return anomalies.length ? { anomalies: anomalies.map(compactAnomaly), tokens: pick([...new Set(anomalies.map((a) => a.tokenId))]) } : null;
    }
    case "ecosystem":
      return f.news.length ? { news: f.news.map(compactNews) } : null;
    case "why": {
      if (!prior.length) return null;
      const referenced = [...new Set(prior.flatMap((p) => p.item.tokenIds))];
      return {
        todaysItems: prior.map((p) => ({ section: p.section, type: p.item.type, headline: p.item.headline, body: p.item.body, factIds: p.item.factIds })),
        market: compactMarket(f),
        tokens: pick(referenced),
        anomalies: f.anomalies.map(compactAnomaly),
        news: f.news.slice(0, 10).map(compactNews),
      };
    }
  }
}

export function sectionPrompt(
  spec: { title: string; goal: string; maxItems: number },
  facts: Record<string, unknown>,
  date: string,
  feedback?: string[],
): string {
  return [
    `BRIEF DATE: ${date} (UTC)`,
    `SECTION: ${spec.title}`,
    `GOAL: ${spec.goal}`,
    `MAX ITEMS: ${spec.maxItems}`,
    feedback?.length
      ? `YOUR PREVIOUS ATTEMPT WAS REJECTED. Fix these problems (drop an item rather than guess):\n- ${feedback.join("\n- ")}`
      : "",
    `FACTS:\n${JSON.stringify(facts)}`,
  ]
    .filter(Boolean)
    .join("\n\n");
}
