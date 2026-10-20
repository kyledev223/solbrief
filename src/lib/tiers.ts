import { LIMITS, TIER_THRESHOLDS, TOKEN, type Tier } from "@/config/site";
import type { Brief } from "./brief/schema";

export const TIER_ORDER: Tier[] = ["FREE", "HOLDER", "WHALE"];

export function tierForBalance(balance: number, thresholds: Record<"HOLDER" | "WHALE", number> = TIER_THRESHOLDS): Tier {
  if (!Number.isFinite(balance) || balance <= 0) return "FREE";
  if (balance >= thresholds.WHALE) return "WHALE";
  if (balance >= thresholds.HOLDER) return "HOLDER";
  return "FREE";
}

export function tierAtLeast(tier: Tier, min: Tier): boolean {
  return TIER_ORDER.indexOf(tier) >= TIER_ORDER.indexOf(min);
}

export function nextTier(tier: Tier, balance: number, thresholds = TIER_THRESHOLDS): { tier: Exclude<Tier, "FREE">; needed: number } | null {
  if (tier === "WHALE") return null;
  const next = tier === "FREE" ? "HOLDER" : "WHALE";
  return { tier: next, needed: Math.max(0, thresholds[next] - Math.max(0, balance)) };
}

export const TIER_FEATURES: Record<Tier, string[]> = {
  FREE: [
    `Yesterday's brief (${LIMITS.freeDelayHours}h delay)`,
    `Top ${LIMITS.freeItemsPerSection} items per section`,
    "Risk flags on every token",
  ],
  HOLDER: [
    "Today's full brief at publish time",
    "Full archive",
    `Up to ${LIMITS.maxTopics} personalized topics`,
    `Ask the Brief: ${LIMITS.askPerDay.HOLDER} questions/day`,
  ],
  WHALE: [
    "Everything in HOLDER",
    `Ask the Brief: ${LIMITS.askPerDay.WHALE} questions/day`,
    `Deep Research: ${LIMITS.researchPerDay.WHALE} reports/day`,
    "Daily digest via Telegram or email",
  ],
};

export function tierRequirement(tier: Tier): string {
  if (tier === "FREE") return "No wallet needed";
  return `≥ ${TIER_THRESHOLDS[tier].toLocaleString("en-US")} ${TOKEN.symbol}`;
}

export type QuotaKind = "ask" | "research";

export function dailyLimit(tier: Tier, kind: QuotaKind): number {
  return kind === "ask" ? LIMITS.askPerDay[tier] : LIMITS.researchPerDay[tier];
}

// ── Brief access ─────────────────────────────────────────────────────────

/** The publish cutoff a tier may see: FREE is delayed 24h, holders see everything. */
export function visibleBefore(tier: Tier, now = Date.now()): string | undefined {
  return tier === "FREE" ? new Date(now - LIMITS.freeDelayHours * 3_600_000).toISOString() : undefined;
}

export function canViewBrief(tier: Tier, publishedAt: string, now = Date.now(), latestFreeDate?: string | null, briefDate?: string): boolean {
  if (tier !== "FREE") return true;
  if (Date.parse(publishedAt) > now - LIMITS.freeDelayHours * 3_600_000) return false;
  // FREE sees only the single most recent delayed brief ("yesterday's brief")
  return latestFreeDate == null || briefDate == null || latestFreeDate === briefDate;
}

/** FREE gets the top N items per section; everyone else gets the full brief. */
export function briefForTier(brief: Brief, tier: Tier): Brief & { truncated: boolean } {
  if (tier !== "FREE") return { ...brief, truncated: false };
  let truncated = false;
  const sections = brief.sections.map((s) => {
    if (s.items.length > LIMITS.freeItemsPerSection) truncated = true;
    return { ...s, items: s.items.slice(0, LIMITS.freeItemsPerSection) };
  });
  return { ...brief, sections, truncated };
}
