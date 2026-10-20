import { TOKEN, type Tier } from "@/config/site";
import { amount } from "@/lib/format";
import { nextTier, TIER_FEATURES, tierRequirement, TIER_ORDER } from "@/lib/tiers";
import { CmdLink } from "./ui";

export function TierTable({ current }: { current?: Tier }) {
  return (
    <div className="grid gap-3 md:grid-cols-3">
      {TIER_ORDER.map((t) => (
        <article
          key={t}
          className={`hover-glow flex min-w-0 flex-col rounded-md border bg-panel/85 p-5 ${t === "HOLDER" ? "border-violet/50 glow" : "border-line"}`}
        >
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-xl font-extrabold tracking-tight">{t}</h3>
            {current === t && <span className="rounded border border-cyan/50 px-1.5 text-[10px] text-cyan">you</span>}
          </div>
          <p className="mt-1 text-xs text-violet-soft">{tierRequirement(t)}</p>
          <ul className="mt-4 flex-1 space-y-2 text-sm text-dim">
            {TIER_FEATURES[t].map((f) => (
              <li key={f} className="flex gap-2">
                <span className="text-cyan">+</span>
                <span>{f}</span>
              </li>
            ))}
          </ul>
        </article>
      ))}
    </div>
  );
}

export function TierCard({ tier, balance, checkedAt, mintConfigured }: { tier: Tier; balance: number; checkedAt: string | null; mintConfigured: boolean }) {
  const next = nextTier(tier, balance);
  return (
    <div className="grid gap-4 sm:grid-cols-3">
      <div className="rounded border border-line bg-bg/60 p-3">
        <div className="text-[10px] uppercase tracking-wider text-faint">current tier</div>
        <div className="mt-1 text-2xl font-extrabold text-gradient">{tier}</div>
      </div>
      <div className="rounded border border-line bg-bg/60 p-3">
        <div className="text-[10px] uppercase tracking-wider text-faint">{TOKEN.symbol} balance</div>
        <div className="mt-1 truncate text-2xl font-extrabold">{amount(balance)}</div>
        <div className="text-[11px] text-faint">{mintConfigured ? `checked ${checkedAt ? checkedAt.slice(11, 16) + " UTC" : "—"} · re-checked every 6h` : "token not launched yet"}</div>
      </div>
      <div className="rounded border border-line bg-bg/60 p-3">
        <div className="text-[10px] uppercase tracking-wider text-faint">next tier</div>
        {next ? (
          <>
            <div className="mt-1 text-lg font-bold">
              {next.tier} <span className="text-sm font-normal text-dim">(+{amount(next.needed)})</span>
            </div>
            <ul className="mt-1 space-y-0.5 text-[11px] text-dim">
              {TIER_FEATURES[next.tier].slice(0, 3).map((f) => (
                <li key={f}>+ {f}</li>
              ))}
            </ul>
          </>
        ) : (
          <div className="mt-1 text-sm text-dim">Top tier — everything unlocked.</div>
        )}
      </div>
    </div>
  );
}

export function Gate({ need, title, children }: { need: Exclude<Tier, "FREE">; title: string; children?: React.ReactNode }) {
  return (
    <div className="rounded-md border border-dashed border-violet/40 bg-violet/5 p-5">
      <div className="text-sm font-bold text-ink">
        <span className="text-violet">🔒</span> {title}
      </div>
      <p className="mt-1 text-sm text-dim">
        Requires the {need} tier ({tierRequirement(need)}). Holding the token unlocks features only — it carries no yield or revenue share.
      </p>
      {children}
      <div className="mt-3 flex flex-wrap gap-2">
        <CmdLink href="/dashboard" variant="primary">
          connect wallet
        </CmdLink>
        <CmdLink href="/#token">about {TOKEN.symbol}</CmdLink>
      </div>
    </div>
  );
}
