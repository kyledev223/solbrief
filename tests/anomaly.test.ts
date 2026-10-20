import { describe, it, expect } from "vitest";
import {
  computeRiskFlags,
  detectLiquidityMove,
  detectSignals,
  detectVolumeSpike,
  isNoteworthyLaunch,
  liquidity24hAgo,
  selectTokensOfInterest,
  volumeBaselineFromCandles,
  volumeBaselinesFromHistory,
  type LiquidityBaseline,
  type VolumeBaseline,
} from "@/lib/anomaly/engine";
import type { PairData } from "@/lib/fetchers/types";
import type { PairSnapshotRow } from "@/lib/db/store";

const NOW = Date.parse("2026-10-19T12:00:00Z");
const H = 3_600_000;

function pair(over: Partial<PairData> = {}): PairData {
  return {
    pairAddress: "PAIR1",
    tokenAddress: "MINT1",
    symbol: "TKN",
    name: "Token",
    dexId: "raydium",
    url: "https://dexscreener.com/solana/pair1",
    quoteSymbol: "SOL",
    priceUsd: 1,
    volumeH24: 100_000,
    volumeH6: 0,
    volumeH1: 0,
    liquidityUsd: 200_000,
    fdv: 1_000_000,
    marketCap: 1_000_000,
    priceChangeH24: 5,
    priceChangeH1: 0,
    pairCreatedAt: NOW - 30 * 24 * H,
    buysH24: 10,
    sellsH24: 10,
    ...over,
  };
}

const baseline = (avg: number, days = 7): VolumeBaseline => ({ avg, days, source: "history" });

describe("volume spike: 24h volume > 3x 7-day average", () => {
  it("flags strictly above the multiple", () => {
    expect(detectVolumeSpike(301, baseline(100))?.ratio).toBeCloseTo(3.01);
    expect(detectVolumeSpike(300, baseline(100))).toBeNull(); // exactly 3x is not "> 3x"
    expect(detectVolumeSpike(250, baseline(100))).toBeNull();
  });

  it("requires enough history and a positive baseline", () => {
    expect(detectVolumeSpike(1_000, baseline(100, 2))).toBeNull();
    expect(detectVolumeSpike(1_000, baseline(0))).toBeNull();
    expect(detectVolumeSpike(1_000, undefined)).toBeNull();
    expect(detectVolumeSpike(1_000, baseline(100, 3))).not.toBeNull();
  });

  it("respects a configurable multiple", () => {
    expect(detectVolumeSpike(250, baseline(100), { volumeMultiple: 2, minHistoryDays: 3 })).not.toBeNull();
  });
});

describe("7-day baselines from snapshots", () => {
  const snap = (hoursAgo: number, vol: number, liq = 100): PairSnapshotRow => ({
    pairAddress: "PAIR1",
    capturedAt: new Date(NOW - hoursAgo * H).toISOString(),
    volumeH24: vol,
    liquidityUsd: liq,
  });

  it("uses the last snapshot of each prior UTC day and ignores the last 20h", () => {
    const rows = [
      snap(2, 9_999_999), // too recent — excluded
      snap(24, 100), // 2026-10-18 12:00
      snap(14 + 24, 300), // 2026-10-17 22:00 (later that day)
      snap(20 + 24, 999), // 2026-10-17 16:00 (earlier, superseded)
      snap(24 * 3, 200), // 2026-10-16
    ];
    const b = volumeBaselinesFromHistory(rows, NOW).get("PAIR1")!;
    expect(b.days).toBe(3);
    expect(b.avg).toBeCloseTo((100 + 300 + 200) / 3);
  });

  it("caps at 7 days", () => {
    const rows = Array.from({ length: 10 }, (_, i) => snap(24 * (i + 1), 10));
    expect(volumeBaselinesFromHistory(rows, NOW).get("PAIR1")!.days).toBeLessThanOrEqual(7);
  });

  it("candle baseline averages completed days", () => {
    expect(volumeBaselineFromCandles([10, 20, 30])).toEqual({ avg: 20, days: 3, source: "geckoterminal" });
    expect(volumeBaselineFromCandles([])).toBeNull();
  });

  it("picks the snapshot closest to 24h ago within 18–30h", () => {
    const rows = [snap(10, 1, 50), snap(23, 1, 80), snap(26, 1, 90), snap(40, 1, 70)];
    expect(liquidity24hAgo(rows, NOW).get("PAIR1")).toBe(80);
    expect(liquidity24hAgo([snap(40, 1, 70)], NOW).has("PAIR1")).toBe(false);
  });
});

describe("liquidity move: |change| > 40% in 24h", () => {
  it("flags moves beyond ±40% using history", () => {
    expect(detectLiquidityMove(141, { prev: 100 })?.pct).toBeCloseTo(41);
    expect(detectLiquidityMove(59, { prev: 100 })?.pct).toBeCloseTo(-41);
    expect(detectLiquidityMove(140, { prev: 100 })).toBeNull();
    expect(detectLiquidityMove(60, { prev: 100 })).toBeNull();
  });

  it("falls back to Jupiter's 24h change, preferring our history", () => {
    expect(detectLiquidityMove(100, { jupiterChangePct: -55 })).toMatchObject({ pct: -55, source: "jupiter" });
    expect(detectLiquidityMove(100, { prev: 100, jupiterChangePct: -55 })).toBeNull();
    expect(detectLiquidityMove(100, {})).toBeNull();
  });
});

describe("new launches", () => {
  it("needs age < 24h and liquidity >= threshold", () => {
    expect(isNoteworthyLaunch({ pairCreatedAt: NOW - 5 * H, liquidityUsd: 50_000 }, NOW)).toBe(true);
    expect(isNoteworthyLaunch({ pairCreatedAt: NOW - 5 * H, liquidityUsd: 49_999 }, NOW)).toBe(false);
    expect(isNoteworthyLaunch({ pairCreatedAt: NOW - 25 * H, liquidityUsd: 1e6 }, NOW)).toBe(false);
    expect(isNoteworthyLaunch({ pairCreatedAt: null, liquidityUsd: 1e6 }, NOW)).toBe(false);
  });

  it("threshold is configurable", () => {
    expect(isNoteworthyLaunch({ pairCreatedAt: NOW - H, liquidityUsd: 20_000 }, NOW, { newPairHours: 24, newLaunchMinLiquidityUsd: 10_000 })).toBe(true);
  });
});

describe("risk flags", () => {
  const byKey = (flags: ReturnType<typeof computeRiskFlags>) => Object.fromEntries(flags.map((f) => [f.key, f.state]));

  it("marks set authorities, concentration, unlocked LP and young pairs", () => {
    const flags = byKey(computeRiskFlags({ mintAuthority: "Auth111", freezeAuthority: "Auth222", top10Pct: 72, lpLockedPct: 10, ageHours: 3 }));
    expect(flags).toEqual({ MINT_AUTHORITY: "yes", FREEZE_AUTHORITY: "yes", TOP10_CONCENTRATION: "yes", LP_UNLOCKED: "yes", NEW_PAIR: "yes" });
  });

  it("clears flags for revoked authorities and healthy distribution", () => {
    const flags = byKey(computeRiskFlags({ mintAuthority: null, freezeAuthority: null, top10Pct: 20, lpLockedPct: 100, ageHours: 500 }));
    expect(flags).toEqual({ MINT_AUTHORITY: "no", FREEZE_AUTHORITY: "no", TOP10_CONCENTRATION: "no", LP_UNLOCKED: "no", NEW_PAIR: "no" });
  });

  it("never guesses: missing data is UNKNOWN", () => {
    const flags = byKey(computeRiskFlags({}));
    expect(Object.values(flags).every((s) => s === "unknown")).toBe(true);
  });

  it("boundaries: 50% concentration and 80% lock are not flagged", () => {
    const flags = byKey(computeRiskFlags({ top10Pct: 50, lpLockedPct: 80 }));
    expect(flags.TOP10_CONCENTRATION).toBe("no");
    expect(flags.LP_UNLOCKED).toBe("no");
  });

  it("every flag set always contains all five keys", () => {
    expect(computeRiskFlags({}).map((f) => f.key).sort()).toEqual(["FREEZE_AUTHORITY", "LP_UNLOCKED", "MINT_AUTHORITY", "NEW_PAIR", "TOP10_CONCENTRATION"]);
  });
});

describe("detectSignals", () => {
  it("produces anomaly facts with computed numbers and ranks tokens of interest", () => {
    const pairs = [
      pair({ pairAddress: "P_SPIKE", tokenAddress: "SPIKE", symbol: "SPK", volumeH24: 500_000 }),
      pair({ pairAddress: "P_LIQ", tokenAddress: "LIQ", symbol: "LIQ", liquidityUsd: 50_000 }),
      pair({ pairAddress: "P_NEW", tokenAddress: "NEW", symbol: "NEW", pairCreatedAt: NOW - 2 * H, liquidityUsd: 80_000, priceChangeH24: 900 }),
      pair({ pairAddress: "P_DUST", tokenAddress: "DUST", symbol: "DST", liquidityUsd: 100, priceChangeH24: 99_999 }),
    ];
    const vol = new Map<string, VolumeBaseline>([["P_SPIKE", baseline(100_000)]]);
    const liq = new Map<string, LiquidityBaseline>([["P_LIQ", { prev: 200_000 }]]);
    const s = detectSignals(pairs, vol, liq, NOW);

    const spike = s.anomalies.find((a) => a.kind === "VOLUME_SPIKE")!;
    expect(spike.mint).toBe("SPIKE");
    expect(spike.ratio).toBeCloseTo(5);
    expect(spike.summary).toContain("5.0x");

    const move = s.anomalies.find((a) => a.kind === "LIQUIDITY_MOVE")!;
    expect(move.mint).toBe("LIQ");
    expect(move.changePct).toBeCloseTo(-75);

    expect(s.launches).toEqual(["NEW"]);
    expect(s.gainers).not.toContain("DUST"); // below ranking liquidity floor
    expect(s.gainers[0]).toBe("NEW");

    const interest = selectTokensOfInterest(s);
    expect(interest.slice(0, 3)).toEqual(["SPIKE", "LIQ", "NEW"]);
    expect(interest).not.toContain("DUST");
  });
});
