import { getJson, mapLimit } from "../http";

// RugCheck public summary (keyless). Used only for LP lock status.
export interface LpLockInfo {
  lpLockedPct: number | null;
  riskNames: string[];
}

export async function lpLockInfo(mints: string[]): Promise<Map<string, LpLockInfo>> {
  const out = new Map<string, LpLockInfo>();
  await mapLimit(mints, 2, async (mint) => {
    try {
      const r = await getJson<{ lpLockedPct?: number; risks?: { name: string }[] }>(
        `https://api.rugcheck.xyz/v1/tokens/${mint}/report/summary`,
        { retries: 1, timeoutMs: 10_000 },
      );
      out.set(mint, {
        lpLockedPct: typeof r.lpLockedPct === "number" ? r.lpLockedPct : null,
        riskNames: (r.risks ?? []).map((x) => x.name).slice(0, 6),
      });
    } catch {
      // unknown — leave unset; the flag renders as UNKNOWN
    }
  });
  return out;
}
