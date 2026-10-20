import { connection } from "next/server";
import { getPulse } from "@/lib/data";
import { utcTime } from "@/lib/format";

/** Status marquee built only from the latest real run. */
export async function Ticker() {
  await connection();
  const p = await getPulse();
  const s = p.stats;
  const lines: string[] = [];
  if (!p.lastRunAt) {
    lines.push("AWAITING FIRST PIPELINE RUN", "DATA: DEXSCREENER · COINGECKO · JUPITER · SOLANA RPC · RSS");
  } else {
    if (p.briefPublishedAt) lines.push(`BRIEF PUBLISHED ${utcTime(p.briefPublishedAt)} · ${p.briefDate}`);
    if (s.pairsScanned != null) lines.push(`${s.pairsScanned} PAIRS SCANNED`);
    if (s.anomalies != null) lines.push(`${s.anomalies} UNUSUAL MOVES FLAGGED`);
    if (s.newLaunches != null) lines.push(`${s.newLaunches} NOTEWORTHY LAUNCHES`);
    if (s.solPriceUsd != null) lines.push(`SOL $${s.solPriceUsd.toFixed(2)}${s.solChange24hPct != null ? ` (${s.solChange24hPct >= 0 ? "+" : ""}${s.solChange24hPct.toFixed(2)}% 24H)` : ""}`);
    if (s.sourcesOk != null) lines.push(`${s.sourcesOk} SOURCES OK${s.sourcesFailed?.length ? ` · ${s.sourcesFailed.length} DEGRADED` : ""}`);
    lines.push(`LAST ${p.lastRunKind === "refresh" ? "REFRESH" : "RUN"} ${utcTime(p.lastRunAt)}`);
  }
  lines.push("FACTS LABELED. SPECULATION LABELED.", "NOT FINANCIAL ADVICE");
  const row = lines.map((l) => `● ${l}`).join("    ");

  return (
    <div className="relative overflow-hidden border-b border-line bg-panel/70 py-1.5 text-[11px] tracking-wider text-dim" role="status" aria-label={lines.join(". ")}>
      <div className="marquee-track flex w-max animate-marquee whitespace-nowrap" aria-hidden>
        <span className="px-4">{row}</span>
        <span className="px-4">{row}</span>
      </div>
      <div aria-hidden className="pointer-events-none absolute inset-y-0 left-0 w-10 bg-gradient-to-r from-bg to-transparent" />
      <div aria-hidden className="pointer-events-none absolute inset-y-0 right-0 w-10 bg-gradient-to-l from-bg to-transparent" />
    </div>
  );
}

export function TickerFallback() {
  return <div className="h-[29px] border-b border-line bg-panel/70" aria-hidden />;
}
