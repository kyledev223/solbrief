/**
 * Facts-only fallback: deterministic VERIFIED items rendered straight from the
 * facts pack. Used when Gemini is not configured or unreachable, so a broken
 * LLM never blocks the brief. ("Why it matters" has no fallback — it is
 * analysis and is omitted instead.)
 */
import { age, pct, usd } from "../format";
import type { FactsPack, TokenFact } from "../types";
import { buildFactIndex, relatedSources, tokensById } from "./facts";
import type { BriefItem, SectionId } from "./schema";

const flagsText = (t: TokenFact) => {
  const yes = t.risk.filter((r) => r.state === "yes").map((r) => r.label.toLowerCase());
  return yes.length ? ` Risk flags: ${yes.join(", ")}.` : "";
};

export function templateItems(section: SectionId, f: FactsPack): BriefItem[] | null {
  const idx = buildFactIndex(f);
  const byId = tokensById(f);
  const src = (...ids: string[]) => ids.filter((id) => idx.has(id)).map((id) => idx.get(id)!);
  const item = (headline: string, body: string, factIds: string[], tokenIds: string[] = []): BriefItem => ({
    type: "VERIFIED",
    headline,
    body,
    factIds,
    tokenIds,
    sources: src(...factIds),
  });

  switch (section) {
    case "market": {
      const out: BriefItem[] = [];
      const sol = f.market.sol;
      if (sol)
        out.push(
          item(
            `SOL at ${usd(sol.priceUsd, { compact: false })}, ${pct(sol.change24hPct)} in 24h`,
            `SOL trades at ${usd(sol.priceUsd, { compact: false })} with ${usd(sol.volume24hUsd)} in 24h volume and a ${usd(sol.marketCapUsd)} market cap.`,
            ["mkt:sol"],
          ),
        );
      for (const c of f.market.categories.slice(0, 2))
        out.push(item(`${c.name}: ${pct(c.change24hPct)} market cap in 24h`, `The ${c.name} category is at ${usd(c.marketCapUsd)} market cap with ${usd(c.volume24hUsd)} 24h volume.`, [`cat:${c.id}`]));
      const leaders = f.topVolume.slice(0, 3).map((id) => byId.get(id)!).filter(Boolean);
      if (leaders.length)
        out.push(
          item(
            "DEX volume leaders among scanned pairs",
            leaders.map((t) => `${t.symbol} ${usd(t.volume24hUsd)}`).join(", ") + ".",
            leaders.map((t) => t.id),
            leaders.map((t) => t.id),
          ),
        );
      return out.length ? out : null;
    }
    case "launches":
      return f.launches.length
        ? f.launches
            .map((id) => byId.get(id))
            .filter((t): t is TokenFact => Boolean(t))
            .map((t) =>
              item(
                `${t.symbol}: new pair, ${age(t.ageHours)} old`,
                `Liquidity ${usd(t.liquidityUsd)}, 24h volume ${usd(t.volume24hUsd)}, market cap ${usd(t.marketCapUsd)}.${flagsText(t)}`,
                [t.id, `anom:new:${t.mint}`].filter((x) => idx.has(x)),
                [t.id],
              ),
            )
        : null;
    case "unusual": {
      const rows = f.anomalies.filter((a) => a.kind !== "NEW_LAUNCH");
      return rows.length
        ? rows.map((a) => {
            const t = byId.get(a.tokenId);
            return item(
              `${a.symbol}: ${a.kind === "VOLUME_SPIKE" ? "volume spike" : "liquidity move"}`,
              `${a.summary.charAt(0).toUpperCase()}${a.summary.slice(1)}.${t ? flagsText(t) : ""}`,
              [a.id],
              [a.tokenId],
            );
          })
        : null;
    }
    case "ecosystem":
      return f.news.length
        ? f.news.slice(0, 6).map((n) => {
            const it = item(n.title, n.summary ? n.summary.slice(0, 260) : `Reported by ${n.source}.`, [n.id]);
            it.sources.push(...relatedSources(f, [n.id]));
            return it;
          })
        : null;
    case "why":
      return null;
  }
}
