export interface FetchLog {
  source: string;
  ok: boolean;
  durationMs: number;
  attempts: number;
  items: number;
  error?: string;
}

/** Normalized DEX pair (one row per base token after de-duplication). */
export interface PairData {
  pairAddress: string;
  tokenAddress: string;
  symbol: string;
  name: string;
  dexId: string;
  url: string;
  quoteSymbol: string;
  priceUsd: number | null;
  volumeH24: number;
  volumeH6: number;
  volumeH1: number;
  liquidityUsd: number;
  fdv: number | null;
  marketCap: number | null;
  priceChangeH24: number | null;
  priceChangeH1: number | null;
  pairCreatedAt: number | null; // epoch ms
  buysH24: number;
  sellsH24: number;
  imageUrl?: string;
  websites?: string[];
}

export interface MarketData {
  sol: { priceUsd: number; change24hPct: number | null; volume24hUsd: number | null; marketCapUsd: number | null } | null;
  ecosystem: Array<{
    id: string;
    symbol: string;
    name: string;
    priceUsd: number;
    change24hPct: number | null;
    marketCapUsd: number | null;
    volume24hUsd: number | null;
  }>;
  categories: Array<{ id: string; name: string; marketCapUsd: number | null; change24hPct: number | null; volume24hUsd: number | null }>;
}

export interface JupiterTokenInfo {
  mint: string;
  verified: boolean;
  tags: string[];
  organicScore: number | null;
  holderCount: number | null;
  liquidityChange24hPct: number | null;
  mintAuthorityDisabled: boolean | null;
  freezeAuthorityDisabled: boolean | null;
  topHoldersPct: number | null;
}

export interface MintInfo {
  mint: string;
  mintAuthority: string | null;
  freezeAuthority: string | null;
  supply: string;
  decimals: number;
  program: string;
}

export interface NewsItem {
  guid: string;
  feedId: string;
  sourceName: string;
  title: string;
  link: string;
  summary: string;
  publishedAt: string | null;
}

export interface FeedConfig {
  id: string;
  name: string;
  url: string;
  category: string;
  keywords?: string[];
  enabled: boolean;
}
