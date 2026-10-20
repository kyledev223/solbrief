/**
 * Deterministic anomaly + risk engine. Pure functions only: no I/O, no LLM.
 * Everything the brief states as a number originates here.
 */
import { ANOMALY } from "@/config/site";
import type { PairSnapshotRow } from "../db/store";
import type { PairData } from "../fetchers/types";
import type { AnomalyFact, RiskFlag, SignalKind, TokenFact } from "../types";

export type AnomalyConfig = { [K in keyof typeof ANOMALY]: number };

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

export interface VolumeBaseline {
  avg: number;
  days: number;
  source: "history" | "geckoterminal";
}

export interface LiquidityBaseline {
  /** Liquidity ~24h ago (from our own snapshots). */
  prev?: number;
  /** Jupiter's reported 24h liquidity change, used when we lack history. */
  jupiterChangePct?: number | null;
}

// ── Baselines ────────────────────────────────────────────────────────────

/**
 * 7-day average daily volume from our own snapshots. For each prior UTC day we
 * take the last snapshot of that day (its rolling 24h volume ≈ that day's
 * volume). Snapshots from the last 20h are excluded so the current 24h window
 * doesn't leak into its own baseline.
 */
export function volumeBaselinesFromHistory(rows: PairSnapshotRow[], now: number, maxDays = 7): Map<string, VolumeBaseline> {
  const cutoff = now - 20 * HOUR;
  const byPair = new Map<string, Map<string, { t: number; v: number }>>();
  for (const r of rows) {
    const t = Date.parse(r.capturedAt);
    if (!(t <= cutoff) || r.volumeH24 == null || t < now - (maxDays + 1) * DAY) continue;
    const day = new Date(t).toISOString().slice(0, 10);
    const days = byPair.get(r.pairAddress) ?? new Map();
    const cur = days.get(day);
    if (!cur || t > cur.t) days.set(day, { t, v: r.volumeH24 });
    byPair.set(r.pairAddress, days);
  }
  const out = new Map<string, VolumeBaseline>();
  for (const [pair, days] of byPair) {
    const vals = [...days.entries()]
      .sort((a, b) => b[0].localeCompare(a[0]))
      .slice(0, maxDays)
      .map(([, x]) => x.v);
    if (vals.length) out.set(pair, { avg: vals.reduce((s, v) => s + v, 0) / vals.length, days: vals.length, source: "history" });
  }
  return out;
}

/** Baseline from completed daily candles (GeckoTerminal OHLCV). */
export function volumeBaselineFromCandles(dailyVolumes: number[]): VolumeBaseline | null {
  const vals = dailyVolumes.filter((v) => Number.isFinite(v) && v >= 0).slice(0, 7);
  if (!vals.length) return null;
  return { avg: vals.reduce((s, v) => s + v, 0) / vals.length, days: vals.length, source: "geckoterminal" };
}

/** Liquidity from the snapshot closest to 24h ago (within 18–30h). */
export function liquidity24hAgo(rows: PairSnapshotRow[], now: number): Map<string, number> {
  const target = now - DAY;
  const best = new Map<string, { d: number; v: number }>();
  for (const r of rows) {
    if (r.liquidityUsd == null) continue;
    const t = Date.parse(r.capturedAt);
    if (t < now - 30 * HOUR || t > now - 18 * HOUR) continue;
    const d = Math.abs(t - target);
    const cur = best.get(r.pairAddress);
    if (!cur || d < cur.d) best.set(r.pairAddress, { d, v: r.liquidityUsd });
  }
  return new Map([...best].map(([k, v]) => [k, v.v]));
}

// ── Detectors ────────────────────────────────────────────────────────────

export function detectVolumeSpike(
  volume24h: number,
  baseline: VolumeBaseline | undefined | null,
  cfg: Pick<AnomalyConfig, "volumeMultiple" | "minHistoryDays"> = ANOMALY,
): { ratio: number; baseline: number; source: VolumeBaseline["source"] } | null {
  if (!baseline || baseline.days < cfg.minHistoryDays || !(baseline.avg > 0)) return null;
  const ratio = volume24h / baseline.avg;
  return ratio > cfg.volumeMultiple ? { ratio, baseline: baseline.avg, source: baseline.source } : null;
}

export function liquidityChangePct(liqNow: number, base: LiquidityBaseline | undefined): { pct: number; source: "history" | "jupiter"; prev: number | null } | null {
  if (base?.prev != null && base.prev > 0) return { pct: ((liqNow - base.prev) / base.prev) * 100, source: "history", prev: base.prev };
  if (base?.jupiterChangePct != null && Number.isFinite(base.jupiterChangePct)) return { pct: base.jupiterChangePct, source: "jupiter", prev: null };
  return null;
}

export function detectLiquidityMove(
  liqNow: number,
  base: LiquidityBaseline | undefined,
  cfg: Pick<AnomalyConfig, "liquidityChangePct"> = ANOMALY,
): { pct: number; source: "history" | "jupiter"; prev: number | null } | null {
  const c = liquidityChangePct(liqNow, base);
  return c && Math.abs(c.pct) > cfg.liquidityChangePct ? c : null;
}

export function pairAgeHours(pairCreatedAt: number | null, now: number): number | null {
  return pairCreatedAt ? Math.max(0, (now - pairCreatedAt) / HOUR) : null;
}

export function isNoteworthyLaunch(
  pair: Pick<PairData, "pairCreatedAt" | "liquidityUsd">,
  now: number,
  cfg: Pick<AnomalyConfig, "newPairHours" | "newLaunchMinLiquidityUsd"> = ANOMALY,
): boolean {
  const age = pairAgeHours(pair.pairCreatedAt, now);
  return age != null && age < cfg.newPairHours && pair.liquidityUsd >= cfg.newLaunchMinLiquidityUsd;
}

// ── Risk flags ───────────────────────────────────────────────────────────

export interface RiskInput {
  /** string = authority set; null = revoked; undefined = unknown */
  mintAuthority?: string | null;
  freezeAuthority?: string | null;
  top10Pct?: number | null;
  lpLockedPct?: number | null;
  ageHours?: number | null;
  sources?: { authorities?: string; top10?: string; lp?: string };
}

const pct = (n: number) => `${n.toFixed(1)}%`;

export function computeRiskFlags(
  r: RiskInput,
  cfg: Pick<AnomalyConfig, "top10ConcentrationPct" | "lpLockedMinPct" | "newPairHours"> = ANOMALY,
): RiskFlag[] {
  const authority = (v: string | null | undefined) => (v === undefined ? "unknown" : v ? "yes" : "no");
  const flags: RiskFlag[] = [
    {
      key: "MINT_AUTHORITY",
      label: "Mint authority enabled",
      state: authority(r.mintAuthority),
      severity: "high",
      detail: r.mintAuthority ? "supply can still be increased" : undefined,
      source: r.sources?.authorities,
    },
    {
      key: "FREEZE_AUTHORITY",
      label: "Freeze authority enabled",
      state: authority(r.freezeAuthority),
      severity: "high",
      detail: r.freezeAuthority ? "holder accounts can be frozen" : undefined,
      source: r.sources?.authorities,
    },
    {
      key: "TOP10_CONCENTRATION",
      label: `Top-10 holders > ${cfg.top10ConcentrationPct}%`,
      state: r.top10Pct == null ? "unknown" : r.top10Pct > cfg.top10ConcentrationPct ? "yes" : "no",
      severity: "medium",
      detail: r.top10Pct == null ? undefined : `top-10 hold ${pct(r.top10Pct)}`,
      source: r.sources?.top10,
    },
    {
      key: "LP_UNLOCKED",
      label: "Liquidity unlocked",
      state: r.lpLockedPct == null ? "unknown" : r.lpLockedPct < cfg.lpLockedMinPct ? "yes" : "no",
      severity: "high",
      detail: r.lpLockedPct == null ? undefined : `${pct(r.lpLockedPct)} of LP locked/burned`,
      source: r.sources?.lp,
    },
    {
      key: "NEW_PAIR",
      label: `Pair < ${cfg.newPairHours}h old`,
      state: r.ageHours == null ? "unknown" : r.ageHours < cfg.newPairHours ? "yes" : "no",
      severity: "medium",
      detail: r.ageHours == null ? undefined : `${r.ageHours.toFixed(1)}h old`,
      source: "dexscreener",
    },
  ];
  return flags;
}

// ── Analysis ─────────────────────────────────────────────────────────────

export interface Signals {
  anomalies: AnomalyFact[];
  signalsByMint: Map<string, Set<SignalKind>>;
  launches: string[]; // mints
  gainers: string[];
  topVolume: string[];
}

const usd = (n: number) =>
  n >= 1e9 ? `$${(n / 1e9).toFixed(2)}B` : n >= 1e6 ? `$${(n / 1e6).toFixed(2)}M` : n >= 1e3 ? `$${(n / 1e3).toFixed(1)}K` : `$${n.toFixed(0)}`;

/** Runs every detector across all pairs. */
export function detectSignals(
  pairs: PairData[],
  volumeBaselines: Map<string, VolumeBaseline>,
  liquidityBaselines: Map<string, LiquidityBaseline>,
  now: number,
  cfg: AnomalyConfig = ANOMALY,
): Signals {
  const anomalies: AnomalyFact[] = [];
  const signalsByMint = new Map<string, Set<SignalKind>>();
  const tag = (mint: string, s: SignalKind) => {
    const set = signalsByMint.get(mint) ?? new Set<SignalKind>();
    set.add(s);
    signalsByMint.set(mint, set);
  };
  const launches: string[] = [];

  for (const p of pairs) {
    const tokenId = `tok:${p.tokenAddress}`;
    const spike = detectVolumeSpike(p.volumeH24, volumeBaselines.get(p.pairAddress), cfg);
    if (spike) {
      tag(p.tokenAddress, "VOLUME_SPIKE");
      anomalies.push({
        id: `anom:vol:${p.tokenAddress}`,
        kind: "VOLUME_SPIKE",
        tokenId,
        mint: p.tokenAddress,
        symbol: p.symbol,
        value: p.volumeH24,
        baseline: spike.baseline,
        ratio: spike.ratio,
        changePct: null,
        baselineSource: spike.source,
        url: p.url,
        summary: `24h volume ${usd(p.volumeH24)} is ${spike.ratio.toFixed(1)}x the 7-day average of ${usd(spike.baseline)}`,
      });
    }

    const liq = detectLiquidityMove(p.liquidityUsd, liquidityBaselines.get(p.pairAddress), cfg);
    // A brand-new pair "gaining" liquidity is just its launch; skip those.
    const age = pairAgeHours(p.pairCreatedAt, now);
    if (liq && !(age != null && age < 24 && liq.pct > 0)) {
      tag(p.tokenAddress, "LIQUIDITY_MOVE");
      anomalies.push({
        id: `anom:liq:${p.tokenAddress}`,
        kind: "LIQUIDITY_MOVE",
        tokenId,
        mint: p.tokenAddress,
        symbol: p.symbol,
        value: p.liquidityUsd,
        baseline: liq.prev,
        ratio: null,
        changePct: liq.pct,
        baselineSource: liq.source,
        url: p.url,
        summary: `liquidity ${liq.pct >= 0 ? "+" : ""}${liq.pct.toFixed(1)}% in 24h to ${usd(p.liquidityUsd)}`,
      });
    }

    if (isNoteworthyLaunch(p, now, cfg)) {
      tag(p.tokenAddress, "NEW_LAUNCH");
      launches.push(p.tokenAddress);
      anomalies.push({
        id: `anom:new:${p.tokenAddress}`,
        kind: "NEW_LAUNCH",
        tokenId,
        mint: p.tokenAddress,
        symbol: p.symbol,
        value: p.liquidityUsd,
        baseline: null,
        ratio: null,
        changePct: null,
        baselineSource: null,
        url: p.url,
        summary: `new pair ${age!.toFixed(1)}h old with ${usd(p.liquidityUsd)} liquidity`,
      });
    }
  }

  const ranked = pairs.filter((p) => p.liquidityUsd >= cfg.minLiquidityForRankingUsd);
  const gainers = ranked
    .filter((p) => p.priceChangeH24 != null && p.priceChangeH24 > 0)
    .sort((a, b) => b.priceChangeH24! - a.priceChangeH24!)
    .slice(0, 5)
    .map((p) => p.tokenAddress);
  const topVolume = [...ranked]
    .sort((a, b) => b.volumeH24 - a.volumeH24)
    .slice(0, 5)
    .map((p) => p.tokenAddress);
  gainers.forEach((m) => tag(m, "TOP_GAINER"));
  topVolume.forEach((m) => tag(m, "TOP_VOLUME"));

  return { anomalies, signalsByMint, launches, gainers, topVolume };
}

/** Which tokens get (rate-limited) on-chain risk enrichment, by priority. */
export function selectTokensOfInterest(signals: Signals, max = ANOMALY.maxTokensOfInterest): string[] {
  const order: string[] = [];
  const push = (m: string) => {
    if (!order.includes(m)) order.push(m);
  };
  signals.anomalies.filter((a) => a.kind !== "NEW_LAUNCH").forEach((a) => push(a.mint));
  signals.launches.forEach(push);
  signals.gainers.forEach(push);
  signals.topVolume.forEach(push);
  return order.slice(0, max);
}

export function buildTokenFact(
  p: PairData,
  risk: RiskInput & { jupiterVerified?: boolean | null },
  signals: Set<SignalKind> | undefined,
  now: number,
  cfg: AnomalyConfig = ANOMALY,
): TokenFact {
  const ageHours = pairAgeHours(p.pairCreatedAt, now);
  const flags = computeRiskFlags({ ...risk, ageHours }, cfg);
  return {
    id: `tok:${p.tokenAddress}`,
    mint: p.tokenAddress,
    symbol: p.symbol,
    name: p.name,
    pairAddress: p.pairAddress,
    pairUrl: p.url,
    dexId: p.dexId,
    ageHours: ageHours == null ? null : Math.round(ageHours * 10) / 10,
    priceUsd: p.priceUsd,
    marketCapUsd: p.marketCap ?? p.fdv,
    fdvUsd: p.fdv,
    volume24hUsd: p.volumeH24,
    liquidityUsd: p.liquidityUsd,
    priceChange24hPct: p.priceChangeH24,
    buys24h: p.buysH24,
    sells24h: p.sellsH24,
    jupiterVerified: risk.jupiterVerified ?? null,
    risk: flags,
    riskCount: flags.filter((f) => f.state === "yes").length,
    signals: [...(signals ?? [])],
    imageUrl: p.imageUrl,
  };
}

export { usd as formatUsdCompact };
