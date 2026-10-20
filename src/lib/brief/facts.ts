import type { AnomalyFact, FactsPack, NewsFact, TokenFact } from "../types";
import type { Source } from "./schema";

/** Round to N significant digits (keeps the facts the model sees short). */
export const sig = (n: number | null | undefined, digits = 3): number | null =>
  n == null || !Number.isFinite(n) ? null : Number(n.toPrecision(digits));
export const round1 = (n: number | null | undefined): number | null => (n == null || !Number.isFinite(n) ? null : Math.round(n * 10) / 10);

export function compactToken(t: TokenFact) {
  return {
    id: t.id,
    symbol: t.symbol,
    name: t.name,
    ageHours: round1(t.ageHours),
    priceUsd: sig(t.priceUsd, 4),
    marketCapUsd: sig(t.marketCapUsd),
    volume24hUsd: sig(t.volume24hUsd),
    liquidityUsd: sig(t.liquidityUsd),
    priceChange24hPct: round1(t.priceChange24hPct),
    buys24h: t.buys24h,
    sells24h: t.sells24h,
    jupiterVerified: t.jupiterVerified,
    signals: t.signals,
    riskFlagsYes: t.risk.filter((r) => r.state === "yes").map((r) => (r.detail ? `${r.label} (${r.detail})` : r.label)),
    riskFlagsUnknown: t.risk.filter((r) => r.state === "unknown").map((r) => r.label),
  };
}

export function compactAnomaly(a: AnomalyFact) {
  return {
    id: a.id,
    kind: a.kind,
    tokenId: a.tokenId,
    symbol: a.symbol,
    valueUsd: sig(a.value),
    baselineUsd: sig(a.baseline),
    ratio: round1(a.ratio),
    changePct: round1(a.changePct),
    baselineSource: a.baselineSource,
    summary: a.summary,
  };
}

export function compactMarket(f: FactsPack) {
  const m = f.market;
  return {
    id: m.id,
    sol: m.sol
      ? {
          priceUsd: Math.round(m.sol.priceUsd * 100) / 100,
          change24hPct: m.sol.change24hPct == null ? null : Math.round(m.sol.change24hPct * 100) / 100,
          volume24hUsd: sig(m.sol.volume24hUsd),
          marketCapUsd: sig(m.sol.marketCapUsd),
        }
      : null,
    categories: m.categories.map((c) => ({ id: `cat:${c.id}`, name: c.name, marketCapUsd: sig(c.marketCapUsd), change24hPct: round1(c.change24hPct) })),
    ecosystem: m.ecosystem.map((e) => ({
      id: `eco:${e.id}`,
      symbol: e.symbol,
      name: e.name,
      priceUsd: sig(e.priceUsd, 4),
      change24hPct: round1(e.change24hPct),
      marketCapUsd: sig(e.marketCapUsd),
    })),
  };
}

export function compactNews(n: NewsFact) {
  return {
    id: n.id,
    source: n.source,
    title: n.title,
    publishedAt: n.publishedAt?.slice(0, 16) ?? null,
    summary: n.summary,
    alsoReportedBy: n.related?.map((r) => r.source),
  };
}

export const tokensById = (f: FactsPack) => new Map(f.tokens.map((t) => [t.id, t]));

/** Every citable fact id → the link we show for it. */
export function buildFactIndex(f: FactsPack): Map<string, Source> {
  const idx = new Map<string, Source>();
  idx.set("mkt:sol", { label: "CoinGecko · SOL", url: f.market.url });
  for (const c of f.market.categories) idx.set(`cat:${c.id}`, { label: `CoinGecko · ${c.name}`, url: c.url });
  for (const e of f.market.ecosystem) idx.set(`eco:${e.id}`, { label: `CoinGecko · ${e.symbol}`, url: e.url });
  for (const t of f.tokens) idx.set(t.id, { label: `DexScreener · ${t.symbol}`, url: t.pairUrl });
  for (const a of f.anomalies) idx.set(a.id, { label: `DexScreener · ${a.symbol}`, url: a.url });
  for (const n of f.news) idx.set(n.id, { label: n.source, url: n.url });
  return idx;
}

/** Extra outlets for a news fact (shown alongside the primary source). */
export function relatedSources(f: FactsPack, factIds: string[]): Source[] {
  const ids = new Set(factIds);
  return f.news.filter((n) => ids.has(n.id)).flatMap((n) => (n.related ?? []).map((r) => ({ label: r.source, url: r.url })));
}
