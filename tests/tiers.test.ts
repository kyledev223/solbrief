import { describe, it, expect, beforeEach } from "vitest";
import { LIMITS, TIER_THRESHOLDS } from "@/config/site";
import { briefForTier, canViewBrief, dailyLimit, nextTier, tierAtLeast, tierForBalance, visibleBefore } from "@/lib/tiers";
import { rateLimit, resetRateLimits } from "@/lib/rate-limit";
import type { Brief } from "@/lib/brief/schema";

const { HOLDER, WHALE } = TIER_THRESHOLDS;

describe("tier calculation", () => {
  it("maps balances to tiers at the configured thresholds", () => {
    expect(tierForBalance(0)).toBe("FREE");
    expect(tierForBalance(HOLDER - 0.000001)).toBe("FREE");
    expect(tierForBalance(HOLDER)).toBe("HOLDER");
    expect(tierForBalance(WHALE - 1)).toBe("HOLDER");
    expect(tierForBalance(WHALE)).toBe("WHALE");
    expect(tierForBalance(WHALE * 100)).toBe("WHALE");
  });

  it("treats bad input as FREE", () => {
    expect(tierForBalance(NaN)).toBe("FREE");
    expect(tierForBalance(-5)).toBe("FREE");
    expect(tierForBalance(Infinity)).toBe("FREE");
  });

  it("supports custom thresholds", () => {
    expect(tierForBalance(10, { HOLDER: 5, WHALE: 50 })).toBe("HOLDER");
  });

  it("computes what the next tier needs", () => {
    expect(nextTier("FREE", 0)).toEqual({ tier: "HOLDER", needed: HOLDER });
    expect(nextTier("FREE", HOLDER / 2)).toEqual({ tier: "HOLDER", needed: HOLDER / 2 });
    expect(nextTier("HOLDER", HOLDER)).toEqual({ tier: "WHALE", needed: WHALE - HOLDER });
    expect(nextTier("WHALE", WHALE)).toBeNull();
  });

  it("orders tiers", () => {
    expect(tierAtLeast("WHALE", "HOLDER")).toBe(true);
    expect(tierAtLeast("HOLDER", "WHALE")).toBe(false);
    expect(tierAtLeast("FREE", "FREE")).toBe(true);
  });

  it("daily limits per tier", () => {
    expect(dailyLimit("FREE", "ask")).toBe(0);
    expect(dailyLimit("HOLDER", "ask")).toBe(10);
    expect(dailyLimit("WHALE", "ask")).toBe(50);
    expect(dailyLimit("HOLDER", "research")).toBe(0);
    expect(dailyLimit("WHALE", "research")).toBeGreaterThan(0);
  });
});

describe("brief access", () => {
  const now = Date.parse("2026-10-19T15:00:00Z");
  const today = "2026-10-19T12:00:00Z";
  const yesterday = "2026-10-18T12:00:00Z";

  it("FREE sees only briefs older than 24h; holders see today's", () => {
    expect(canViewBrief("FREE", today, now)).toBe(false);
    expect(canViewBrief("FREE", yesterday, now)).toBe(true);
    expect(canViewBrief("HOLDER", today, now)).toBe(true);
    expect(canViewBrief("WHALE", today, now)).toBe(true);
    expect(visibleBefore("FREE", now)).toBe("2026-10-18T15:00:00.000Z");
    expect(visibleBefore("HOLDER", now)).toBeUndefined();
  });

  it("FREE gets only the single latest delayed brief, not the archive", () => {
    expect(canViewBrief("FREE", "2026-10-10T12:00:00Z", now, "2026-10-18", "2026-10-10")).toBe(false);
    expect(canViewBrief("FREE", yesterday, now, "2026-10-18", "2026-10-18")).toBe(true);
    expect(canViewBrief("HOLDER", "2026-10-10T12:00:00Z", now, "2026-10-18", "2026-10-10")).toBe(true);
  });

  it("FREE is truncated to the top N items per section", () => {
    const item = { type: "VERIFIED" as const, headline: "h", body: "b", factIds: ["x"], tokenIds: [], sources: [] };
    const brief: Brief = {
      date: "2026-10-18",
      headline: "x",
      sections: [{ id: "market", title: "Market", items: Array(6).fill(item) }],
      omitted: [],
      mode: "llm",
      model: null,
      generatedAt: yesterday,
      disclaimer: "d",
    };
    const free = briefForTier(brief, "FREE");
    expect(free.sections[0].items).toHaveLength(LIMITS.freeItemsPerSection);
    expect(free.truncated).toBe(true);
    expect(briefForTier(brief, "HOLDER").sections[0].items).toHaveLength(6);
  });
});

describe("rate limiter", () => {
  beforeEach(() => resetRateLimits());

  it("allows up to the limit within the window, then blocks", () => {
    const t = 1_000_000;
    for (let i = 0; i < 3; i++) expect(rateLimit("k", 3, 60_000, t + i).ok).toBe(true);
    const blocked = rateLimit("k", 3, 60_000, t + 10);
    expect(blocked.ok).toBe(false);
    expect(blocked.retryAfterSec).toBeGreaterThan(0);
    expect(rateLimit("k", 3, 60_000, t + 60_001).ok).toBe(true);
  });

  it("keys are independent", () => {
    expect(rateLimit("a", 1, 1000, 0).ok).toBe(true);
    expect(rateLimit("b", 1, 1000, 0).ok).toBe(true);
    expect(rateLimit("a", 1, 1000, 1).ok).toBe(false);
  });
});
