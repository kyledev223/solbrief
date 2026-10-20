import { IGNORED_MINTS } from "@/config/site";
import type { Store } from "../db/store";
import { FetchContext } from "../fetchers/context";
import { fetchMarket } from "../fetchers/coingecko";
import { dedupeByToken, discoverTokens, pairsByAddress, pairsForTokens } from "../fetchers/dexscreener";
import { poolAddresses } from "../fetchers/geckoterminal";
import { fetchFeeds } from "../fetchers/rss";
import type { FeedConfig, MarketData, NewsItem, PairData } from "../fetchers/types";

export interface Collected {
  market: MarketData | null;
  /** One pair per base token (deepest liquidity), majors/stables removed. */
  pairs: PairData[];
  news: NewsItem[];
  pairsScanned: number;
}

export interface CollectKeys {
  coingeckoKey: string;
}

/**
 * Phase 1: pull every source in parallel. Each source is isolated — a failure
 * is logged on the context and simply contributes nothing.
 */
export async function collect(ctx: FetchContext, feeds: FeedConfig[], keys: CollectKeys): Promise<Collected> {
  const [market, discovered, newPools, trendingPools, news] = await Promise.all([
    ctx.run("coingecko", (a) => fetchMarket(keys.coingeckoKey, a), (m) => (m.sol ? 1 : 0) + m.ecosystem.length),
    ctx.run("dexscreener:discovery", (a) => discoverTokens(a)),
    ctx.run("geckoterminal:new_pools", (a) => poolAddresses("new_pools", a)),
    ctx.run("geckoterminal:trending_pools", (a) => poolAddresses("trending_pools", a)),
    fetchFeeds(feeds, ctx),
  ]);

  const [byToken, byPool] = await Promise.all([
    discovered?.length ? ctx.run("dexscreener:tokens", (a) => pairsForTokens(discovered, a)) : Promise.resolve(null),
    newPools?.length || trendingPools?.length
      ? ctx.run("dexscreener:pairs", (a) => pairsByAddress([...(newPools ?? []), ...(trendingPools ?? [])], a))
      : Promise.resolve(null),
  ]);

  const all = [...(byToken ?? []), ...(byPool ?? [])];
  const pairs = dedupeByToken(all).filter((p) => !IGNORED_MINTS.has(p.tokenAddress) && p.liquidityUsd > 0);

  return { market, pairs, news, pairsScanned: new Set(all.map((p) => p.pairAddress)).size };
}

/** Persist raw source data. Storage failures are logged, never fatal. */
export async function persistCollected(store: Store, runId: string, data: Collected): Promise<void> {
  const tasks: Array<[string, Promise<void>]> = [
    ["pair_snapshots", store.insertPairSnapshots(runId, data.pairs)],
    ["news_items", store.upsertNews(data.news)],
    ["raw:dexscreener", store.insertRawSnapshot(runId, "dexscreener", data.pairs)],
  ];
  if (data.market) tasks.push(["raw:coingecko", store.insertRawSnapshot(runId, "coingecko", data.market)]);
  const results = await Promise.allSettled(tasks.map(([, p]) => p));
  results.forEach((r, i) => {
    if (r.status === "rejected") console.error(`[store] ${tasks[i][0]} failed:`, r.reason);
  });
}
