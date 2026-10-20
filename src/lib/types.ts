import type { Tier } from "@/config/site";

export type { Tier };

// ── Risk flags & facts (computed by deterministic code) ──────────────────

export type FlagState = "yes" | "no" | "unknown";
export type RiskKey = "MINT_AUTHORITY" | "FREEZE_AUTHORITY" | "TOP10_CONCENTRATION" | "LP_UNLOCKED" | "NEW_PAIR";

export interface RiskFlag {
  key: RiskKey;
  label: string;
  state: FlagState;
  detail?: string;
  severity: "high" | "medium";
  source?: string;
}

export type SignalKind = "VOLUME_SPIKE" | "LIQUIDITY_MOVE" | "NEW_LAUNCH" | "TOP_GAINER" | "TOP_VOLUME";

export interface TokenFact {
  id: string; // "tok:<mint>"
  mint: string;
  symbol: string;
  name: string;
  pairAddress: string;
  pairUrl: string;
  dexId: string;
  ageHours: number | null;
  priceUsd: number | null;
  marketCapUsd: number | null;
  fdvUsd: number | null;
  volume24hUsd: number;
  liquidityUsd: number;
  priceChange24hPct: number | null;
  buys24h: number;
  sells24h: number;
  jupiterVerified: boolean | null;
  risk: RiskFlag[];
  riskCount: number;
  signals: SignalKind[];
  imageUrl?: string;
}

export interface AnomalyFact {
  id: string; // "anom:<kind>:<mint>"
  kind: "VOLUME_SPIKE" | "LIQUIDITY_MOVE" | "NEW_LAUNCH";
  tokenId: string;
  mint: string;
  symbol: string;
  value: number;
  baseline: number | null;
  ratio: number | null;
  changePct: number | null;
  baselineSource: "history" | "geckoterminal" | "jupiter" | null;
  url: string;
  summary: string;
}

export interface NewsFact {
  id: string; // "news:<n>"
  source: string;
  title: string;
  url: string;
  publishedAt: string | null;
  summary: string;
}

export interface MarketFact {
  id: "mkt:sol";
  url: string;
  sol: { priceUsd: number; change24hPct: number | null; volume24hUsd: number | null; marketCapUsd: number | null } | null;
  categories: Array<{ id: string; name: string; marketCapUsd: number | null; change24hPct: number | null; volume24hUsd: number | null; url: string }>;
  ecosystem: Array<{ id: string; symbol: string; name: string; priceUsd: number; change24hPct: number | null; marketCapUsd: number | null; url: string }>;
}

export interface RunStats {
  pairsScanned: number;
  tokensEnriched: number;
  anomalies: number;
  newLaunches: number;
  newsItems: number;
  sourcesOk: number;
  sourcesFailed: string[];
  solPriceUsd?: number | null;
  solChange24hPct?: number | null;
  briefPublished?: boolean;
  briefDate?: string;
  omittedSections?: string[];
  durationMs?: number;
}

export interface FactsPack {
  date: string; // YYYY-MM-DD (UTC)
  generatedAt: string;
  runId: string;
  market: MarketFact;
  tokens: TokenFact[];
  anomalies: AnomalyFact[];
  launches: string[]; // token ids
  gainers: string[];
  topVolume: string[];
  news: NewsFact[];
  stats: RunStats;
}

// ── Users & topics ───────────────────────────────────────────────────────

export type Topic =
  | { kind: "preset"; key: string }
  | { kind: "project"; value: string }
  | { kind: "wallet"; value: string };

export function topicKey(t: Topic): string {
  if (t.kind === "preset") return `preset:${t.key}`;
  // base58 addresses are case-sensitive; project names are not
  if (t.kind === "wallet") return `wallet:${t.value}`;
  return `project:${t.value.trim().toLowerCase()}`;
}
