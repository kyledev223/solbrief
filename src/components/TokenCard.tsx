import { age, pct, usd } from "@/lib/format";
import type { TokenFact } from "@/lib/types";
import { RiskChips } from "./RiskChips";

const SIGNAL_LABEL: Record<string, string> = {
  NEW_LAUNCH: "new launch",
  VOLUME_SPIKE: "volume spike",
  LIQUIDITY_MOVE: "liquidity move",
  TOP_GAINER: "top gainer",
  TOP_VOLUME: "volume leader",
};

export function TokenCard({ t }: { t: TokenFact }) {
  return (
    <article className="hover-glow flex min-w-0 flex-col gap-3 rounded-md border border-line bg-panel/85 p-4">
      <header className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <a href={t.pairUrl} target="_blank" rel="noopener noreferrer" className="block truncate text-lg font-extrabold tracking-tight text-ink hover:text-cyan">
            ${t.symbol}
          </a>
          <div className="truncate text-[11px] text-faint">{t.name}</div>
        </div>
        <span className="shrink-0 rounded border border-line-2 px-1.5 py-0.5 text-[10px] text-dim">age {age(t.ageHours)}</span>
      </header>
      <dl className="grid grid-cols-3 gap-2 text-[11px]">
        <div className="min-w-0">
          <dt className="text-faint">mcap</dt>
          <dd className="truncate font-semibold text-ink">{usd(t.marketCapUsd)}</dd>
        </div>
        <div className="min-w-0">
          <dt className="text-faint">24h vol</dt>
          <dd className="truncate font-semibold text-ink">{usd(t.volume24hUsd)}</dd>
        </div>
        <div className="min-w-0">
          <dt className="text-faint">liquidity</dt>
          <dd className="truncate font-semibold text-ink">{usd(t.liquidityUsd)}</dd>
        </div>
      </dl>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] text-dim">
        <span>24h {pct(t.priceChange24hPct)}</span>
        {t.signals.map((s) => (
          <span key={s} className="text-cyan/80">
            #{SIGNAL_LABEL[s] ?? s}
          </span>
        ))}
        {t.jupiterVerified && <span className="text-dim">· jup verified</span>}
      </div>
      <RiskChips flags={t.risk} />
    </article>
  );
}
