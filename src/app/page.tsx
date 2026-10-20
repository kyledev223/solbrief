import { connection } from "next/server";
import { Suspense } from "react";
import { APP_NAME, FAQ, SITE, TOKEN } from "@/config/site";
import { AsciiLogo } from "@/components/AsciiLogo";
import { ItemCard, type MentionToken } from "@/components/BriefView";
import { CopyButton, PromptInput, TypingText } from "@/components/client-bits";
import { SocialButtons } from "@/components/SocialButtons";
import { TierTable } from "@/components/tiers";
import { TokenCard } from "@/components/TokenCard";
import { CmdLink, Container, Panel, SectionHeader, Skeleton, Stat } from "@/components/ui";
import type { BriefItem } from "@/lib/brief/schema";
import { featuredTokens, getPulse, safeLatestBrief } from "@/lib/data";
import { pct, usd, utcDateTime } from "@/lib/format";
import { visibleBefore } from "@/lib/tiers";

export default function Home() {
  return (
    <>
      <Hero />
      <Container className="space-y-20 pt-6">
        <section>
          <SectionHeader n={1} title="Today's signals" sub="Live numbers from the latest pipeline run. Computed by code, not by the model." />
          <Suspense fallback={<Panel label="pulse" live><Skeleton lines={4} /></Panel>}>
            <PulseAndTokens />
          </Suspense>
        </section>

        <section>
          <SectionHeader n={2} title="Sample brief" sub="Every item is labeled. VERIFIED items link to the data point or article behind them." />
          <Suspense fallback={<Skeleton lines={6} />}>
            <SamplePreview />
          </Suspense>
        </section>

        <section>
          <SectionHeader n={3} title="Access tiers" sub={`Holding ${TOKEN.symbol} unlocks product features. Balances are checked server-side; no transaction is ever needed to sign in.`} />
          <TierTable />
        </section>

        <section id="token" className="scroll-mt-24">
          <SectionHeader n={4} title={`The ${TOKEN.symbol} token`} sub="An access key for the product — nothing more." />
          <TokenSection />
        </section>

        <section>
          <SectionHeader n={5} title="FAQ" />
          <div className="space-y-2">
            {FAQ.map((f) => (
              <details key={f.q} className="group rounded-md border border-line bg-panel/80 open:border-violet/40">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-semibold [&::-webkit-details-marker]:hidden">
                  <span>
                    <span className="text-violet">?</span> {f.q}
                  </span>
                  <span aria-hidden className="text-dim transition-transform group-open:rotate-45">
                    +
                  </span>
                </summary>
                <p className="px-4 pb-4 text-sm leading-relaxed text-dim">{f.a}</p>
              </details>
            ))}
          </div>
        </section>
      </Container>
    </>
  );
}

function Hero() {
  return (
    <Container className="pb-10 pt-12 sm:pt-16">
      <AsciiLogo />
      <p className="mt-6 max-w-3xl text-base font-semibold text-ink sm:text-lg">
        <TypingText text={SITE.tagline} />
      </p>
      <p className="mt-3 max-w-2xl text-sm leading-relaxed text-dim">
        An AI agent scans Solana DEX pairs, launches, on-chain token risk and ecosystem news every day at 12:00 UTC. Deterministic code finds the anomalies; the model only explains them.
      </p>
      <div className="mt-6 max-w-2xl">
        <PromptInput />
      </div>
      <div className="mt-5 flex flex-wrap gap-2">
        <CmdLink href="/brief/today" variant="primary">
          read the brief
        </CmdLink>
        <CmdLink href="/docs">how it works</CmdLink>
        <CmdLink href="/archive">/archive</CmdLink>
      </div>
      <div className="mt-3">
        <SocialButtons variant="full" />
      </div>
    </Container>
  );
}

async function PulseAndTokens() {
  await connection();
  const [pulse, brief] = await Promise.all([getPulse(), safeLatestBrief(visibleBefore("FREE"))]);
  const s = pulse.stats;
  const tokens = featuredTokens(brief, 6);
  return (
    <div className="space-y-4">
      <Panel label={`pulse · last run ${utcDateTime(pulse.lastRunAt)}`} live={Boolean(pulse.lastRunAt)}>
        {pulse.lastRunAt ? (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
            <Stat label="SOL" value={s.solPriceUsd != null ? `$${s.solPriceUsd.toFixed(2)}` : "—"} hint={`${pct(s.solChange24hPct ?? null, 2)} 24h`} />
            <Stat label="pairs scanned" value={s.pairsScanned ?? "—"} />
            <Stat label="unusual moves" value={s.anomalies ?? "—"} hint="vol >3x · liq ±40%" />
            <Stat label="launches" value={s.newLaunches ?? "—"} hint="<24h · ≥$50K liq" />
            <Stat label="news items" value={s.newsItems ?? "—"} />
            <Stat label="sources ok" value={s.sourcesOk ?? "—"} hint={s.sourcesFailed?.length ? `${s.sourcesFailed.length} degraded` : "all healthy"} />
          </div>
        ) : (
          <p className="text-sm text-dim">No pipeline run yet. Once the first run completes, live numbers appear here.</p>
        )}
      </Panel>
      {tokens.length > 0 && (
        <>
          <p className="text-xs text-faint">
            Tokens from the {brief!.briefDate} brief (free tier view). Trending ≠ good — check every risk flag.
          </p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {tokens.map((t) => (
              <TokenCard key={t.id} t={t} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

const SAMPLE: BriefItem[] = [
  {
    type: "VERIFIED",
    headline: "$EXAMPLE pair launched with $84.2K liquidity",
    body: "The pair is 3.1h old with $1.20M in 24h volume. Mint authority is still enabled, so supply can be increased.",
    factIds: ["tok:sample"],
    tokenIds: ["tok:sample"],
    sources: [{ label: "DexScreener · EXAMPLE", url: "https://dexscreener.com/solana" }],
  },
  {
    type: "SPECULATION",
    headline: "Launch activity may be concentrating on one venue",
    body: "Several of today's new pairs share the same DEX; one reading is that launch tooling there is drawing flow. This is interpretation, not a measured fact.",
    factIds: [],
    tokenIds: [],
    sources: [],
  },
];
const SAMPLE_TOKENS = new Map<string, MentionToken>([
  [
    "tok:sample",
    {
      id: "tok:sample",
      symbol: "EXAMPLE",
      pairUrl: "https://dexscreener.com/solana",
      risk: [
        { key: "MINT_AUTHORITY", label: "Mint authority enabled", state: "yes", severity: "high" },
        { key: "NEW_PAIR", label: "Pair < 24h old", state: "yes", severity: "medium" },
        { key: "LP_UNLOCKED", label: "Liquidity unlocked", state: "unknown", severity: "high" },
      ],
    },
  ],
]);

async function SamplePreview() {
  await connection();
  const brief = await safeLatestBrief(visibleBefore("FREE"));
  if (!brief) {
    return (
      <Panel label="sample · illustrative, not live data">
        <ul className="grid gap-3 md:grid-cols-2">
          {SAMPLE.map((i) => (
            <ItemCard key={i.headline} item={i} tokens={SAMPLE_TOKENS} />
          ))}
        </ul>
      </Panel>
    );
  }
  const tokens = new Map(brief.facts.tokens.map((t) => [t.id, t]));
  const items = brief.content.sections.flatMap((s) => s.items.slice(0, 1).map((i) => ({ s: s.title, i }))).slice(0, 4);
  return (
    <Panel label={`brief · ${brief.briefDate} · ${brief.content.headline}`} right={<span className="hidden sm:inline">{usd(brief.facts.market.sol?.priceUsd ?? null, { compact: false })} SOL</span>}>
      <ul className="grid gap-3 md:grid-cols-2">
        {items.map(({ s, i }) => (
          <div key={`${s}-${i.headline}`} className="min-w-0">
            <div className="mb-1 text-[10px] uppercase tracking-wider text-faint">{s}</div>
            <ItemCard item={i} tokens={tokens} />
          </div>
        ))}
      </ul>
      <div className="mt-4 flex flex-wrap gap-2">
        <CmdLink href={`/brief/${brief.briefDate}`}>read full brief</CmdLink>
      </div>
    </Panel>
  );
}

function TokenSection() {
  const mint = TOKEN.mint;
  const links = mint ? TOKEN.links(mint) : null;
  return (
    <Panel label={`${TOKEN.symbol} · contract`}>
      {mint ? (
        <div className="space-y-4">
          <div className="flex min-w-0 items-center gap-2 rounded border border-line bg-bg/70 p-2.5">
            <code className="min-w-0 flex-1 truncate text-sm text-ink" title={mint}>
              {mint}
            </code>
            <CopyButton value={mint} />
          </div>
          <div className="flex flex-wrap gap-2">
            <a className="rounded border border-line-2 px-3 py-1.5 text-xs text-dim hover:text-cyan" href={links!.dexscreener} target="_blank" rel="noopener noreferrer">
              &gt;_ dexscreener ↗
            </a>
            <a className="rounded border border-line-2 px-3 py-1.5 text-xs text-dim hover:text-cyan" href={links!.solscan} target="_blank" rel="noopener noreferrer">
              &gt;_ solscan ↗
            </a>
            <a className="rounded border border-line-2 px-3 py-1.5 text-xs text-dim hover:text-cyan" href={links!.pumpfun} target="_blank" rel="noopener noreferrer">
              &gt;_ pump.fun ↗
            </a>
          </div>
        </div>
      ) : (
        <p className="text-sm text-dim">Contract address not published yet. Always verify the address here before interacting with any token claiming to be {TOKEN.symbol}.</p>
      )}
      <ul className="mt-5 space-y-1.5 text-sm text-dim">
        <li>
          <span className="text-cyan">+</span> {TOKEN.symbol} gives access to {APP_NAME} features (tiers above). That is its only function here.
        </li>
        <li>
          <span className="text-risk">−</span> No revenue share, staking yield, dividends, buybacks or any promise of value.
        </li>
        <li>
          <span className="text-risk">−</span> {APP_NAME} never asks you to send tokens or sign a transaction to use the product.
        </li>
      </ul>
    </Panel>
  );
}
