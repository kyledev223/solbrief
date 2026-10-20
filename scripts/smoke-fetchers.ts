/**
 * Hits every live data source once and prints what came back.
 *   npm run smoke
 */
import feedsJson from "../src/config/feeds.json";
import { FetchContext } from "../src/lib/fetchers/context";
import { collect } from "../src/lib/pipeline/collect";
import { tokenInfo } from "../src/lib/fetchers/jupiter";
import { RpcClient } from "../src/lib/fetchers/rpc";
import { lpLockInfo } from "../src/lib/fetchers/rugcheck";
import { dailyVolumes } from "../src/lib/fetchers/geckoterminal";
import type { FeedConfig } from "../src/lib/fetchers/types";

async function main() {
  const ctx = new FetchContext();
  const t0 = Date.now();
  const data = await collect(ctx, feedsJson.feeds as FeedConfig[], { coingeckoKey: process.env.COINGECKO_API_KEY ?? "" });
  console.log(`collect: ${Date.now() - t0}ms, ${data.pairs.length} tokens from ${data.pairsScanned} pairs, ${data.news.length} news`);
  console.log("SOL:", data.market?.sol);
  console.log("categories:", data.market?.categories.map((c) => c.id));
  const top = [...data.pairs].sort((a, b) => b.volumeH24 - a.volumeH24).slice(0, 5);
  console.table(top.map((p) => ({ sym: p.symbol, liq: Math.round(p.liquidityUsd), vol: Math.round(p.volumeH24), ageH: p.pairCreatedAt ? Math.round((Date.now() - p.pairCreatedAt) / 3.6e6) : null })));
  console.log("news:", data.news.slice(0, 5).map((n) => `${n.sourceName}: ${n.title}`));

  const mints = top.map((p) => p.tokenAddress);
  const jup = await ctx.run("jupiter", (a) => tokenInfo(mints, process.env.JUPITER_API_KEY ?? "", a));
  console.log("jupiter:", jup && [...jup.values()].map((j) => ({ mint: j.mint.slice(0, 6), verified: j.verified, liqChg: j.liquidityChange24hPct })));

  const rpc = new RpcClient(process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com");
  const mi = await ctx.run("rpc:mints", () => rpc.mintInfos(mints));
  console.log("mint infos:", mi && [...mi.values()].map((m) => ({ mint: m.mint.slice(0, 6), mintAuth: !!m.mintAuthority, freeze: !!m.freezeAuthority })));
  if (mi?.size) {
    const first = [...mi.values()][0];
    const t10 = await ctx.run("rpc:top10", () => rpc.top10Pct(first.mint, first.supply));
    console.log("top10 %:", t10);
  }
  const lp = await ctx.run("rugcheck", () => lpLockInfo(mints.slice(0, 2)));
  console.log("rugcheck:", lp && Object.fromEntries(lp));
  if (top[0]) {
    const vols = await ctx.run("geckoterminal:ohlcv", (a) => dailyVolumes(top[0].pairAddress, 7, a));
    console.log("daily vols:", vols);
  }

  console.log("\nfetch logs:");
  console.table(ctx.logs.map((l) => ({ source: l.source, ok: l.ok, ms: l.durationMs, tries: l.attempts, items: l.items, error: l.error?.slice(0, 60) })));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
