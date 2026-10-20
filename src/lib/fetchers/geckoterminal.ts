import { getJson, sleep } from "../http";
import type { AttemptHook } from "./context";

// GeckoTerminal (CoinGecko's keyless on-chain API, ~30 req/min).
const BASE = "https://api.geckoterminal.com/api/v2";
const HEADERS = { accept: "application/json;version=20230203" };

interface PoolList {
  data: Array<{ attributes: { address: string } }>;
}

export async function poolAddresses(kind: "new_pools" | "trending_pools", onAttempt?: AttemptHook): Promise<string[]> {
  const r = await getJson<PoolList>(`${BASE}/networks/solana/${kind}?page=1`, { headers: HEADERS, onAttempt });
  return r.data.map((p) => p.attributes.address).filter(Boolean);
}

/**
 * Completed daily volumes (USD) for a pool, newest first, excluding the
 * current (partial) UTC day.
 */
export async function dailyVolumes(pool: string, days = 7, onAttempt?: AttemptHook): Promise<number[]> {
  const r = await getJson<{ data: { attributes: { ohlcv_list: number[][] } } }>(
    `${BASE}/networks/solana/pools/${pool}/ohlcv/day?limit=${days + 1}&currency=usd`,
    { headers: HEADERS, onAttempt, retries: 1 },
  );
  const startOfToday = Math.floor(Date.now() / 86_400_000) * 86_400;
  return r.data.attributes.ohlcv_list
    .filter((c) => c[0] < startOfToday)
    .sort((a, b) => b[0] - a[0])
    .slice(0, days)
    .map((c) => c[5]);
}

/** Sequential backfill that stays under the free-tier rate limit. */
export async function backfillDailyVolumes(pools: string[], onAttempt?: AttemptHook): Promise<Map<string, number[]>> {
  const out = new Map<string, number[]>();
  for (const [i, pool] of pools.entries()) {
    if (i > 0) await sleep(2_100);
    try {
      out.set(pool, await dailyVolumes(pool, 7, onAttempt));
    } catch {
      // one pool failing is fine; the anomaly engine treats it as "no baseline"
    }
  }
  return out;
}
