import { chunk, getJson, mapLimit } from "../http";
import type { AttemptHook } from "./context";
import type { PairData } from "./types";

const BASE = "https://api.dexscreener.com";

interface RawPair {
  chainId: string;
  dexId: string;
  url: string;
  pairAddress: string;
  baseToken: { address: string; name: string; symbol: string };
  quoteToken: { address: string; symbol: string };
  priceUsd?: string;
  txns?: { h24?: { buys: number; sells: number } };
  volume?: { h24?: number; h6?: number; h1?: number };
  priceChange?: { h24?: number; h1?: number };
  liquidity?: { usd?: number };
  fdv?: number;
  marketCap?: number;
  pairCreatedAt?: number;
  info?: { imageUrl?: string; websites?: { url: string }[] };
}

interface ProfileOrBoost {
  chainId: string;
  tokenAddress: string;
}

const num = (v: unknown): number | null => {
  const n = typeof v === "string" ? Number(v) : typeof v === "number" ? v : NaN;
  return Number.isFinite(n) ? n : null;
};

export function normalizePair(p: RawPair): PairData {
  return {
    pairAddress: p.pairAddress,
    tokenAddress: p.baseToken.address,
    symbol: p.baseToken.symbol?.slice(0, 24) ?? "?",
    name: p.baseToken.name?.slice(0, 64) ?? "",
    dexId: p.dexId,
    url: p.url,
    quoteSymbol: p.quoteToken?.symbol ?? "",
    priceUsd: num(p.priceUsd),
    volumeH24: num(p.volume?.h24) ?? 0,
    volumeH6: num(p.volume?.h6) ?? 0,
    volumeH1: num(p.volume?.h1) ?? 0,
    liquidityUsd: num(p.liquidity?.usd) ?? 0,
    fdv: num(p.fdv),
    marketCap: num(p.marketCap),
    priceChangeH24: num(p.priceChange?.h24),
    priceChangeH1: num(p.priceChange?.h1),
    pairCreatedAt: num(p.pairCreatedAt),
    buysH24: p.txns?.h24?.buys ?? 0,
    sellsH24: p.txns?.h24?.sells ?? 0,
    imageUrl: p.info?.imageUrl,
    websites: p.info?.websites?.map((w) => w.url).slice(0, 3),
  };
}

/** Token addresses surfaced by DexScreener's latest profiles and boosts. */
export async function discoverTokens(onAttempt?: AttemptHook): Promise<string[]> {
  const endpoints = ["/token-profiles/latest/v1", "/token-boosts/latest/v1", "/token-boosts/top/v1"];
  const results = await Promise.allSettled(endpoints.map((e) => getJson<ProfileOrBoost[]>(`${BASE}${e}`, { onAttempt })));
  const ok = results.filter((r): r is PromiseFulfilledResult<ProfileOrBoost[]> => r.status === "fulfilled");
  if (ok.length === 0) throw new Error("all DexScreener discovery endpoints failed");
  const set = new Set<string>();
  for (const r of ok) for (const t of r.value) if (t.chainId === "solana" && t.tokenAddress) set.add(t.tokenAddress);
  return [...set];
}

/** Pairs for token addresses (30 per request). */
export async function pairsForTokens(addresses: string[], onAttempt?: AttemptHook): Promise<PairData[]> {
  const batches = chunk([...new Set(addresses)], 30);
  const res = await mapLimit(batches, 3, (b) =>
    getJson<RawPair[]>(`${BASE}/tokens/v1/solana/${b.join(",")}`, { onAttempt }).catch(() => [] as RawPair[]),
  );
  return res
    .flat()
    .filter((p) => p.chainId === "solana")
    .map(normalizePair);
}

/** Pairs by pair (pool) address (30 per request). */
export async function pairsByAddress(pairAddresses: string[], onAttempt?: AttemptHook): Promise<PairData[]> {
  const batches = chunk([...new Set(pairAddresses)], 30);
  const res = await mapLimit(batches, 3, (b) =>
    getJson<{ pairs: RawPair[] | null }>(`${BASE}/latest/dex/pairs/solana/${b.join(",")}`, { onAttempt })
      .then((r) => r.pairs ?? [])
      .catch(() => [] as RawPair[]),
  );
  return res
    .flat()
    .filter((p) => p.chainId === "solana")
    .map(normalizePair);
}

export async function searchPairs(query: string, onAttempt?: AttemptHook): Promise<PairData[]> {
  const r = await getJson<{ pairs: RawPair[] | null }>(`${BASE}/latest/dex/search?q=${encodeURIComponent(query)}`, { onAttempt });
  return (r.pairs ?? []).filter((p) => p.chainId === "solana").map(normalizePair);
}

/** Keep the deepest-liquidity pair per base token. */
export function dedupeByToken(pairs: PairData[]): PairData[] {
  const best = new Map<string, PairData>();
  for (const p of pairs) {
    const cur = best.get(p.tokenAddress);
    if (!cur || p.liquidityUsd > cur.liquidityUsd) best.set(p.tokenAddress, p);
  }
  return [...best.values()];
}
