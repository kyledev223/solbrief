import { chunk, getJson, mapLimit } from "../http";
import type { AttemptHook } from "./context";
import type { JupiterTokenInfo } from "./types";

export interface RawJupToken {
  id: string;
  name?: string;
  symbol?: string;
  mcap?: number;
  usdPrice?: number;
  liquidity?: number;
  createdAt?: string;
  isVerified?: boolean;
  tags?: string[];
  organicScore?: number;
  holderCount?: number;
  stats24h?: { liquidityChange?: number; priceChange?: number; volumeChange?: number };
  audit?: { mintAuthorityDisabled?: boolean; freezeAuthorityDisabled?: boolean; topHoldersPercentage?: number };
}

function base(apiKey: string) {
  return apiKey
    ? { url: "https://api.jup.ag/tokens/v2", headers: { "x-api-key": apiKey } as Record<string, string> }
    : { url: "https://lite-api.jup.ag/tokens/v2", headers: {} as Record<string, string> };
}

export function normalizeJupToken(t: RawJupToken): JupiterTokenInfo {
  return {
    mint: t.id,
    verified: Boolean(t.isVerified || t.tags?.includes("verified")),
    tags: t.tags ?? [],
    organicScore: t.organicScore ?? null,
    holderCount: t.holderCount ?? null,
    liquidityChange24hPct: t.stats24h?.liquidityChange ?? null,
    mintAuthorityDisabled: t.audit?.mintAuthorityDisabled ?? null,
    freezeAuthorityDisabled: t.audit?.freezeAuthorityDisabled ?? null,
    topHoldersPct: t.audit?.topHoldersPercentage ?? null,
  };
}

/** Verification status + audit hints for up to 100 mints per request. */
export async function tokenInfo(mints: string[], apiKey: string, onAttempt?: AttemptHook): Promise<Map<string, JupiterTokenInfo>> {
  const { url, headers } = base(apiKey);
  const out = new Map<string, JupiterTokenInfo>();
  const batches = chunk([...new Set(mints)], 100);
  const results = await mapLimit(batches, 2, (b) => getJson<RawJupToken[]>(`${url}/search?query=${b.join(",")}`, { headers, onAttempt }));
  for (const t of results.flat()) out.set(t.id, normalizeJupToken(t));
  return out;
}

export async function searchToken(query: string, apiKey: string): Promise<RawJupToken[]> {
  const { url, headers } = base(apiKey);
  return getJson<RawJupToken[]>(`${url}/search?query=${encodeURIComponent(query)}`, { headers });
}
