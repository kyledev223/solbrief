/**
 * Central product configuration. Rename the product by changing APP_NAME —
 * every page, the ASCII logo, OG image, emails and prompts read from here.
 */
export const APP_NAME = "SOLBRIEF";
export const APP_SLUG = APP_NAME.toLowerCase();

export const SITE = {
  name: APP_NAME,
  tagline: "The daily Solana ecosystem brief. Facts labeled. Speculation labeled.",
  description:
    "An AI agent that scans Solana markets, launches and announcements every day and publishes a brief where every claim is labeled VERIFIED or SPECULATION.",
  url: (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/$/, ""),
  disclaimer: "Not financial advice. Informational only.",
} as const;

/** Access token. The mint lives in .env so it can be set at launch. */
export const TOKEN = {
  symbol: "$BRIEF",
  ticker: "BRIEF",
  mint: process.env.NEXT_PUBLIC_TOKEN_MINT ?? "",
  links(mint: string) {
    return {
      dexscreener: `https://dexscreener.com/solana/${mint}`,
      solscan: `https://solscan.io/token/${mint}`,
      pumpfun: `https://pump.fun/coin/${mint}`,
    };
  },
} as const;

/** X account: a handle ("solbrief", "@solbrief") or a full URL. Empty hides the button. */
function xUrl(v: string | undefined): string {
  const s = (v ?? "").trim();
  if (!s) return "";
  if (/^https?:\/\//i.test(s)) return s;
  return `https://x.com/${s.replace(/^@/, "")}`;
}

export const SOCIAL = {
  x: xUrl(process.env.NEXT_PUBLIC_X_HANDLE),
  /** pump.fun page for the token; empty until the mint is set. */
  pumpfun: TOKEN.mint ? TOKEN.links(TOKEN.mint).pumpfun : "",
} as const;

export type Tier = "FREE" | "HOLDER" | "WHALE";

/** Tier thresholds, in whole tokens (UI amount, not base units). */
export const TIER_THRESHOLDS: Record<Exclude<Tier, "FREE">, number> = {
  HOLDER: 100_000,
  WHALE: 1_000_000,
};

export const LIMITS = {
  freeItemsPerSection: 3,
  freeDelayHours: 24,
  maxTopics: 5,
  askPerDay: { FREE: 0, HOLDER: 10, WHALE: 50 } satisfies Record<Tier, number>,
  researchPerDay: { FREE: 0, HOLDER: 0, WHALE: 3 } satisfies Record<Tier, number>,
  balanceRecheckHours: 6,
  sessionDays: 7,
  nonceTtlMinutes: 10,
  questionMaxChars: 500,
  researchQueryMaxChars: 120,
} as const;

export const GEMINI = {
  /** Current free-tier "flash" model. Override with GEMINI_MODEL. */
  model: process.env.GEMINI_MODEL ?? "gemini-3.8-flash",
  /** Used when the primary model is rate-limited or quota-exhausted. */
  fallbackModel: process.env.GEMINI_FALLBACK_MODEL ?? "gemini-3.5-flash-lite",
  /** Requests per minute we allow ourselves (stay under the free-tier RPM). */
  rpm: Number(process.env.GEMINI_RPM ?? 8),
  maxAttempts: 4,
  timeoutMs: 90_000,
} as const;

export const ANOMALY = {
  /** 24h volume > N × 7-day average daily volume. */
  volumeMultiple: 3,
  /** Minimum days of history before a 7d average is trusted. */
  minHistoryDays: 3,
  /** |liquidity change over 24h| > N percent. */
  liquidityChangePct: 40,
  /** A launch is "noteworthy" only with at least this much liquidity. */
  newLaunchMinLiquidityUsd: 50_000,
  /** Pairs younger than this are "new" and get the NEW_PAIR flag. */
  newPairHours: 24,
  /** Top-10 holders owning more than this share of supply is flagged. */
  top10ConcentrationPct: 50,
  /** LP locked/burned below this share is flagged as unlocked. */
  lpLockedMinPct: 80,
  /** Ignore dust pairs for rankings and volume/liquidity anomalies. */
  minLiquidityForRankingUsd: 25_000,
  /** Max tokens enriched with on-chain risk data per run. */
  maxTokensOfInterest: 30,
  /** Max GeckoTerminal OHLCV backfills per run (free tier ~30 req/min). */
  maxVolumeBackfills: 12,
} as const;

/** Mints never treated as "tokens of interest" (quote assets / majors). */
export const IGNORED_MINTS = new Set([
  "So11111111111111111111111111111111111111112", // wSOL
  "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", // USDC
  "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB", // USDT
]);

/** Personalized topic presets. Users can also add projects or wallets. */
export const TOPIC_PRESETS = [
  { key: "defi", label: "DeFi", keywords: ["defi", "dex", "lending", "perp", "amm", "yield", "liquidity", "swap", "jupiter", "raydium", "orca", "kamino", "drift", "marginfi", "meteora"] },
  { key: "nft", label: "NFTs", keywords: ["nft", "collection", "magic eden", "tensor", "metaplex", "compressed nft", "cnft"] },
  { key: "memecoins", label: "Memecoins", keywords: ["meme", "memecoin", "pump.fun", "pumpswap", "bonk", "wif", "dog", "cat", "frog"] },
  { key: "depin", label: "DePIN", keywords: ["depin", "helium", "hivemapper", "render", "io.net", "nosana", "geodnet", "wireless"] },
  { key: "ai", label: "AI agents", keywords: ["ai", "agent", "llm", "inference", "machine learning"] },
  { key: "payments", label: "Payments & stablecoins", keywords: ["payment", "stablecoin", "usdc", "pyusd", "usdt", "solana pay", "visa", "merchant"] },
  { key: "infra", label: "Infra & validators", keywords: ["validator", "firedancer", "agave", "anza", "rpc", "jito", "mev", "upgrade", "simd", "network", "outage", "tps"] },
  { key: "lst", label: "Liquid staking", keywords: ["staking", "lst", "jitosol", "msol", "bsol", "jupsol", "marinade", "sanctum", "restaking"] },
  { key: "gaming", label: "Gaming", keywords: ["game", "gaming", "play", "esports"] },
] as const;

export const NAV = [
  { href: "/brief/today", label: "brief" },
  { href: "/archive", label: "archive" },
  { href: "/ask", label: "ask" },
  { href: "/dashboard", label: "dashboard" },
  { href: "/docs", label: "docs" },
] as const;

export const FAQ = [
  {
    q: `What is ${APP_NAME}?`,
    a: `${APP_NAME} is an automated agent that pulls public Solana market data, on-chain token data and ecosystem news every day, runs deterministic anomaly checks, and has an LLM explain the results. Every item is labeled VERIFIED (with a source link) or SPECULATION.`,
  },
  {
    q: "Does the AI make up numbers?",
    a: "No. All numbers are computed by code from the data sources and handed to the model as facts. The output is validated against a strict schema and a numeric-grounding check; items that fail are dropped.",
  },
  {
    q: "Is this financial advice?",
    a: "No. The brief never recommends buying or selling, makes no price predictions, and shows risk flags next to every token. Trending does not mean good.",
  },
  {
    q: `What does holding ${TOKEN.symbol} do?`,
    a: `Holding ${TOKEN.symbol} unlocks product features: the same-day brief, the full archive, personalized topics, Ask the Brief and, for larger holders, Deep Research and digest delivery. It gives access only. There is no yield, revenue share, staking reward or buyback attached to it.`,
  },
  {
    q: "Do I need to send a transaction to log in?",
    a: "No. You sign a plain-text message with your wallet (Sign-In With Solana). It costs nothing, moves nothing, and we never ask for a seed phrase.",
  },
  {
    q: "How often is the data refreshed?",
    a: "The full brief publishes daily at 12:00 UTC. Market data and anomaly checks refresh every 4 hours.",
  },
] as const;
