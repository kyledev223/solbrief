import { ANOMALY } from "@/config/site";
import {
  buildTokenFact,
  detectSignals,
  liquidity24hAgo,
  selectTokensOfInterest,
  volumeBaselineFromCandles,
  volumeBaselinesFromHistory,
  type LiquidityBaseline,
  type RiskInput,
} from "../anomaly/engine";
import type { Store, TokenRiskData } from "../db/store";
import type { FetchContext } from "../fetchers/context";
import { backfillDailyVolumes } from "../fetchers/geckoterminal";
import { tokenInfo } from "../fetchers/jupiter";
import { RpcClient } from "../fetchers/rpc";
import { lpLockInfo } from "../fetchers/rugcheck";
import { clusterNews } from "../fetchers/rss";
import type { JupiterTokenInfo } from "../fetchers/types";
import type { FactsPack, MarketFact, NewsFact, RunStats } from "../types";
import type { Collected } from "./collect";

export interface AnalyzeOpts {
  runId: string;
  now: number;
  rpcUrl: string;
  jupiterKey: string;
  /** Skip GeckoTerminal backfill (used by the lighter 4-hourly refresh). */
  light?: boolean;
}

const isPublicRpc = (url: string) => /api\.mainnet-beta\.solana\.com/.test(url);

/** Phase 2: baselines → detectors → risk enrichment → facts pack. */
export async function analyze(ctx: FetchContext, store: Store, data: Collected, opts: AnalyzeOpts): Promise<FactsPack> {
  const { now } = opts;
  const pairs = data.pairs;
  const pairAddrs = pairs.map((p) => p.pairAddress);

  // 1. Baselines from our own history
  const history = await store.pairHistory(pairAddrs, new Date(now - 9 * 86_400_000).toISOString()).catch((err) => {
    console.error("[analyze] pairHistory failed", err);
    return [];
  });
  const volumeBaselines = volumeBaselinesFromHistory(history, now);
  const liqPrev = liquidity24hAgo(history, now);

  // 2. Jupiter verification + 24h liquidity change for every pair (1–2 requests)
  const jup =
    (await ctx.run("jupiter", (a) => tokenInfo(pairs.map((p) => p.tokenAddress), opts.jupiterKey, a))) ?? new Map<string, JupiterTokenInfo>();

  // 3. Backfill 7d volume baselines from GeckoTerminal where history is thin
  if (!opts.light) {
    const needs = pairs
      .filter((p) => (volumeBaselines.get(p.pairAddress)?.days ?? 0) < ANOMALY.minHistoryDays && p.liquidityUsd >= ANOMALY.minLiquidityForRankingUsd)
      .filter((p) => !p.pairCreatedAt || now - p.pairCreatedAt > 3 * 86_400_000) // needs ≥3 completed days to exist
      .sort((a, b) => b.volumeH24 - a.volumeH24)
      .slice(0, ANOMALY.maxVolumeBackfills)
      .map((p) => p.pairAddress);
    if (needs.length) {
      const candles = await ctx.run("geckoterminal:ohlcv", (a) => backfillDailyVolumes(needs, a));
      for (const [pool, vols] of candles ?? []) {
        const b = volumeBaselineFromCandles(vols);
        if (b) volumeBaselines.set(pool, b);
      }
    }
  }

  const liquidityBaselines = new Map<string, LiquidityBaseline>(
    pairs.map((p) => [p.pairAddress, { prev: liqPrev.get(p.pairAddress), jupiterChangePct: jup.get(p.tokenAddress)?.liquidityChange24hPct ?? null }]),
  );

  // 4. Detectors
  const signals = detectSignals(pairs, volumeBaselines, liquidityBaselines, now);
  const interest = selectTokensOfInterest(signals);

  // 5. Risk enrichment (cached 6h per token)
  const risk = await enrichRisk(ctx, store, interest, jup, opts.rpcUrl);

  const byMint = new Map(pairs.map((p) => [p.tokenAddress, p]));
  const tokens = interest
    .map((m) => byMint.get(m))
    .filter((p): p is NonNullable<typeof p> => Boolean(p))
    .map((p) => {
      const r = risk.get(p.tokenAddress);
      const input: RiskInput & { jupiterVerified?: boolean | null } = r
        ? {
            mintAuthority: r.mintAuthority,
            freezeAuthority: r.freezeAuthority,
            top10Pct: r.top10Pct,
            lpLockedPct: r.lpLockedPct,
            jupiterVerified: r.jupiterVerified,
            sources: { authorities: r.sources[0], top10: r.sources[1], lp: r.sources[2] },
          }
        : { jupiterVerified: jup.get(p.tokenAddress)?.verified ?? null };
      return buildTokenFact(p, input, signals.signalsByMint.get(p.tokenAddress), now);
    });
  const included = new Set(tokens.map((t) => t.mint));

  const market = toMarketFact(data);
  const news: NewsFact[] = clusterNews(data.news)
    .slice(0, 25)
    .map(({ primary: n, related }, i) => ({
      id: `news:${i + 1}`,
      source: n.sourceName,
      title: n.title,
      url: n.link,
      publishedAt: n.publishedAt,
      summary: n.summary.slice(0, 280),
      related: related.map((r) => ({ source: r.sourceName, url: r.link })),
    }));

  const anomalies = signals.anomalies.filter((a) => included.has(a.mint));
  const stats: RunStats = {
    pairsScanned: data.pairsScanned,
    tokensEnriched: tokens.length,
    anomalies: anomalies.filter((a) => a.kind !== "NEW_LAUNCH").length,
    newLaunches: signals.launches.filter((m) => included.has(m)).length,
    newsItems: news.length,
    sourcesOk: ctx.logs.filter((l) => l.ok).length,
    sourcesFailed: ctx.failedSources,
    solPriceUsd: market.sol?.priceUsd ?? null,
    solChange24hPct: market.sol?.change24hPct ?? null,
  };

  return {
    date: new Date(now).toISOString().slice(0, 10),
    generatedAt: new Date(now).toISOString(),
    runId: opts.runId,
    market,
    tokens,
    anomalies,
    launches: signals.launches.filter((m) => included.has(m)).map((m) => `tok:${m}`),
    gainers: signals.gainers.filter((m) => included.has(m)).map((m) => `tok:${m}`),
    topVolume: signals.topVolume.filter((m) => included.has(m)).map((m) => `tok:${m}`),
    news,
    stats,
  };
}

function toMarketFact(data: Collected): MarketFact {
  return {
    id: "mkt:sol",
    url: "https://www.coingecko.com/en/coins/solana",
    sol: data.market?.sol ?? null,
    categories: (data.market?.categories ?? []).map((c) => ({ ...c, url: `https://www.coingecko.com/en/categories/${c.id}` })),
    ecosystem: (data.market?.ecosystem ?? []).slice(0, 10).map((e) => ({
      id: e.id,
      symbol: e.symbol,
      name: e.name,
      priceUsd: e.priceUsd,
      change24hPct: e.change24hPct,
      marketCapUsd: e.marketCapUsd,
      url: `https://www.coingecko.com/en/coins/${e.id}`,
    })),
  };
}

/**
 * Mint/freeze authority from RPC, top-10 concentration from RPC (Helius) with
 * Jupiter audit as fallback, LP lock from RugCheck. Unknown stays unknown.
 */
export async function enrichRisk(
  ctx: FetchContext,
  store: Store,
  mints: string[],
  jup: Map<string, JupiterTokenInfo>,
  rpcUrl: string,
): Promise<Map<string, TokenRiskData>> {
  const cached = await store.getTokenRisk(mints, 6).catch(() => new Map<string, TokenRiskData>());
  const missing = mints.filter((m) => !cached.has(m));
  if (!missing.length) return cached;

  const rpc = new RpcClient(rpcUrl);
  const mintInfos = await ctx.run("rpc:mints", () => rpc.mintInfos(missing));
  const top10 = isPublicRpc(rpcUrl)
    ? null // public RPC rate-limits getTokenLargestAccounts; use Jupiter audit instead
    : await ctx.run("rpc:top10", () =>
        rpc.top10PctMany(missing.filter((m) => mintInfos?.get(m)).map((m) => ({ mint: m, supply: mintInfos!.get(m)!.supply }))),
      );
  const lp = await ctx.run("rugcheck", () => lpLockInfo(missing));

  const fresh = new Map<string, TokenRiskData>();
  for (const m of missing) {
    const mi = mintInfos?.get(m);
    const j = jup.get(m);
    const fromJup = (disabled: boolean | null | undefined) => (disabled == null ? undefined : disabled ? null : "set (per Jupiter audit)");
    const authSource = mi ? "rpc" : j?.mintAuthorityDisabled != null ? "jupiter" : "unknown";
    const t10 = top10?.get(m) ?? j?.topHoldersPct ?? null;
    fresh.set(m, {
      mintAuthority: mi ? mi.mintAuthority : fromJup(j?.mintAuthorityDisabled),
      freezeAuthority: mi ? mi.freezeAuthority : fromJup(j?.freezeAuthorityDisabled),
      top10Pct: t10,
      lpLockedPct: lp?.get(m)?.lpLockedPct ?? null,
      jupiterVerified: j?.verified ?? null,
      supply: mi?.supply,
      sources: [authSource, top10?.has(m) ? "rpc" : t10 != null ? "jupiter" : "unknown", lp?.get(m) ? "rugcheck" : "unknown"],
    });
  }
  // Only cache entries where authorities resolved; retry unknowns next run.
  const cacheable = new Map([...fresh].filter(([, v]) => v.mintAuthority !== undefined));
  await store.upsertTokenRisk(cacheable).catch((err) => console.error("[analyze] upsertTokenRisk failed", err));
  return new Map([...cached, ...fresh]);
}
