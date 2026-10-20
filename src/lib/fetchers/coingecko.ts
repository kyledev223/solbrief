import { getJson } from "../http";
import type { AttemptHook } from "./context";
import type { MarketData } from "./types";

const BASE = "https://api.coingecko.com/api/v3";

function headers(key: string): Record<string, string> {
  return key ? { "x-cg-demo-api-key": key } : {};
}

interface SimplePrice {
  solana?: { usd: number; usd_24h_change?: number; usd_24h_vol?: number; usd_market_cap?: number };
}
interface MarketRow {
  id: string;
  symbol: string;
  name: string;
  current_price: number;
  price_change_percentage_24h: number | null;
  market_cap: number | null;
  total_volume: number | null;
}
interface CategoryRow {
  id: string;
  name: string;
  market_cap: number | null;
  market_cap_change_24h: number | null;
  volume_24h: number | null;
}

export async function fetchMarket(apiKey: string, onAttempt?: AttemptHook): Promise<MarketData> {
  const h = headers(apiKey);
  const [price, markets, categories] = await Promise.allSettled([
    getJson<SimplePrice>(
      `${BASE}/simple/price?ids=solana&vs_currencies=usd&include_24hr_change=true&include_24hr_vol=true&include_market_cap=true`,
      { headers: h, onAttempt },
    ),
    getJson<MarketRow[]>(
      `${BASE}/coins/markets?vs_currency=usd&category=solana-ecosystem&order=market_cap_desc&per_page=20&page=1&price_change_percentage=24h`,
      { headers: h, onAttempt },
    ),
    getJson<CategoryRow[]>(`${BASE}/coins/categories`, { headers: h, onAttempt, timeoutMs: 20_000 }),
  ]);
  if (price.status === "rejected" && markets.status === "rejected") throw price.reason;

  const sol = price.status === "fulfilled" && price.value.solana ? price.value.solana : null;
  return {
    sol: sol
      ? {
          priceUsd: sol.usd,
          change24hPct: sol.usd_24h_change ?? null,
          volume24hUsd: sol.usd_24h_vol ?? null,
          marketCapUsd: sol.usd_market_cap ?? null,
        }
      : null,
    ecosystem:
      markets.status === "fulfilled"
        ? markets.value.map((m) => ({
            id: m.id,
            symbol: m.symbol.toUpperCase(),
            name: m.name,
            priceUsd: m.current_price,
            change24hPct: m.price_change_percentage_24h,
            marketCapUsd: m.market_cap,
            volume24hUsd: m.total_volume,
          }))
        : [],
    categories:
      categories.status === "fulfilled"
        ? categories.value
            .filter((c) => /solana/i.test(c.id) && c.market_cap != null)
            .map((c) => ({
              id: c.id,
              name: c.name,
              marketCapUsd: c.market_cap,
              change24hPct: c.market_cap_change_24h,
              volume24hUsd: c.volume_24h,
            }))
        : [],
  };
}

export interface CoinProfile {
  id: string;
  name: string;
  symbol: string;
  description: string;
  homepage: string | null;
  categories: string[];
  marketCapRank: number | null;
  priceUsd: number | null;
  marketCapUsd: number | null;
  change7dPct: number | null;
  change30dPct: number | null;
  solanaMint: string | null;
}

/** Search + profile lookup used by Deep Research. */
export async function findCoin(query: string, apiKey: string): Promise<CoinProfile | null> {
  const h = headers(apiKey);
  const s = await getJson<{ coins: { id: string }[] }>(`${BASE}/search?query=${encodeURIComponent(query)}`, { headers: h });
  const id = s.coins[0]?.id;
  if (!id) return null;
  const c = await getJson<{
    id: string;
    name: string;
    symbol: string;
    description?: { en?: string };
    links?: { homepage?: string[] };
    categories?: string[];
    market_cap_rank?: number | null;
    platforms?: Record<string, string>;
    market_data?: {
      current_price?: { usd?: number };
      market_cap?: { usd?: number };
      price_change_percentage_7d?: number;
      price_change_percentage_30d?: number;
    };
  }>(`${BASE}/coins/${id}?localization=false&tickers=false&community_data=false&developer_data=false`, { headers: h });
  return {
    id: c.id,
    name: c.name,
    symbol: c.symbol.toUpperCase(),
    description: (c.description?.en ?? "").replace(/<[^>]+>/g, "").slice(0, 1200),
    homepage: c.links?.homepage?.find(Boolean) ?? null,
    categories: (c.categories ?? []).filter(Boolean).slice(0, 8),
    marketCapRank: c.market_cap_rank ?? null,
    priceUsd: c.market_data?.current_price?.usd ?? null,
    marketCapUsd: c.market_data?.market_cap?.usd ?? null,
    change7dPct: c.market_data?.price_change_percentage_7d ?? null,
    change30dPct: c.market_data?.price_change_percentage_30d ?? null,
    solanaMint: c.platforms?.solana || null,
  };
}
