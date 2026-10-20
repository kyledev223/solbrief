import "server-only";
import { tryGetStore } from "./db";
import type { BriefRow } from "./db/store";
import type { RunStats, TokenFact } from "./types";

export interface Pulse {
  configured: boolean;
  lastRunAt: string | null;
  lastRunKind: string | null;
  lastRunStatus: string | null;
  stats: Partial<RunStats>;
  briefDate: string | null;
  briefPublishedAt: string | null;
}

const EMPTY: Pulse = { configured: false, lastRunAt: null, lastRunKind: null, lastRunStatus: null, stats: {}, briefDate: null, briefPublishedAt: null };

/** Latest pipeline numbers for the ticker and live pulse panel (real data only). */
export async function getPulse(): Promise<Pulse> {
  const store = tryGetStore();
  if (!store) return EMPTY;
  try {
    const [run, brief] = await Promise.all([store.latestRun({ finishedOnly: true }), store.latestBrief()]);
    return {
      configured: true,
      lastRunAt: run?.finishedAt ?? null,
      lastRunKind: run?.kind ?? null,
      lastRunStatus: run?.status ?? null,
      stats: run?.stats ?? {},
      briefDate: brief?.briefDate ?? null,
      briefPublishedAt: brief?.publishedAt ?? null,
    };
  } catch (err) {
    console.error("[pulse]", err);
    return EMPTY;
  }
}

export async function safeLatestBrief(publishedBefore?: string): Promise<BriefRow | null> {
  try {
    return (await tryGetStore()?.latestBrief(publishedBefore)) ?? null;
  } catch (err) {
    console.error("[data] latestBrief", err);
    return null;
  }
}

export async function safeBrief(date: string): Promise<BriefRow | null> {
  try {
    return (await tryGetStore()?.getBrief(date)) ?? null;
  } catch (err) {
    console.error("[data] getBrief", err);
    return null;
  }
}

export async function safeBriefList(limit = 90) {
  try {
    return (await tryGetStore()?.listBriefs(limit)) ?? [];
  } catch (err) {
    console.error("[data] listBriefs", err);
    return [];
  }
}

/** Tokens to show as cards: launches, anomalies, then volume leaders. */
export function featuredTokens(b: BriefRow | null, n = 6): TokenFact[] {
  if (!b) return [];
  const f = b.facts;
  const order = [...f.launches, ...f.anomalies.map((a) => a.tokenId), ...f.topVolume, ...f.gainers];
  const byId = new Map(f.tokens.map((t) => [t.id, t]));
  return [...new Set(order)]
    .map((id) => byId.get(id))
    .filter((t): t is TokenFact => Boolean(t))
    .slice(0, n);
}
