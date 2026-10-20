import type { Metadata } from "next";
import feeds from "@/config/feeds.json";
import { ANOMALY, APP_NAME, GEMINI, LIMITS, SITE, TOKEN } from "@/config/site";
import { Container, Panel, SectionHeader, TypeBadge } from "@/components/ui";

export const metadata: Metadata = { title: "Docs" };

const SOURCES = [
  ["DexScreener API", "Pair discovery (latest profiles and boosts), pair prices, 24h volume, liquidity, FDV/market cap, pair age.", "https://docs.dexscreener.com/api/reference"],
  ["GeckoTerminal (CoinGecko on-chain)", "New and trending Solana pools for discovery; daily OHLCV volumes to backfill 7-day baselines.", "https://www.geckoterminal.com/dex-api"],
  ["CoinGecko API", "SOL price, 24h change, volume and market cap; Solana category and ecosystem token market data.", "https://docs.coingecko.com"],
  ["Jupiter Token API", "Token verification status, tags, organic score; audit hints used as fallbacks for authorities and holder concentration.", "https://dev.jup.ag/docs/tokens"],
  ["Solana RPC (Helius free tier or public)", "Mint and freeze authority (getMultipleAccounts), top-10 holder share (getTokenLargestAccounts), wallet balances for tiers.", "https://docs.helius.dev"],
  ["RugCheck", "Share of LP locked or burned, for the LIQUIDITY UNLOCKED flag.", "https://api.rugcheck.xyz/swagger/index.html"],
  ["RSS feeds", `${feeds.feeds.length} configurable feeds: official Solana news, project blogs and crypto outlets filtered to Solana stories.`, null],
] as const;

export default function DocsPage() {
  return (
    <Container className="space-y-14 py-10">
      <section>
        <SectionHeader n={1} title="How it works" />
        <div className="grid gap-3 md:grid-cols-2">
          {[
            ["collect", "Every source runs in isolation, with timeouts, retries and backoff. A failing source is logged and skipped; it never stops the brief."],
            ["detect", "Deterministic code computes every number and flag: volume spikes, liquidity moves, launches, risk flags. No LLM is involved at this stage."],
            ["explain", `${GEMINI.model} receives only those computed facts and writes short items. Its output is validated against a strict JSON schema and our guards.`],
            ["publish", "Daily at 12:00 UTC, with a lighter data refresh every 4 hours. Each item is labeled VERIFIED or SPECULATION. Every token shows its risk flags."],
          ].map(([k, v], i) => (
            <Panel key={k} label={`step ${i + 1} · ${k}`}>
              <p className="text-sm leading-relaxed text-dim">{v}</p>
            </Panel>
          ))}
        </div>
      </section>

      <section id="sources" className="scroll-mt-24">
        <SectionHeader n={2} title="Data sources" sub="Only free, keyless or free-key public sources." />
        <Panel label="sources" bodyClassName="p-0">
          <ul className="divide-y divide-line">
            {SOURCES.map(([name, what, url]) => (
              <li key={name} className="px-4 py-3">
                <div className="text-sm font-bold text-ink">
                  {url ? (
                    <a href={url} target="_blank" rel="noopener noreferrer" className="hover:text-cyan">
                      {name} ↗
                    </a>
                  ) : (
                    name
                  )}
                </div>
                <p className="mt-0.5 text-sm text-dim">{what}</p>
              </li>
            ))}
          </ul>
        </Panel>
      </section>

      <section id="methodology" className="scroll-mt-24">
        <SectionHeader n={3} title="Methodology" />
        <div className="grid gap-3 md:grid-cols-2">
          <Panel label="unusual volume">
            <p className="text-sm text-dim">
              Flagged when 24h volume is more than <b className="text-ink">{ANOMALY.volumeMultiple}x</b> the 7-day average daily volume. The baseline comes from our own snapshots (last snapshot of each prior UTC day). It needs at least {ANOMALY.minHistoryDays} days of history. Until then, completed daily candles from GeckoTerminal are used.
            </p>
          </Panel>
          <Panel label="liquidity moves">
            <p className="text-sm text-dim">
              Flagged when liquidity changed by more than <b className="text-ink">±{ANOMALY.liquidityChangePct}%</b> versus our snapshot from about 24h earlier. Jupiter&apos;s reported 24h change is used when we have no history. Pairs younger than 24h and pools below ${ANOMALY.minLiquidityForRankingUsd.toLocaleString("en-US")} are ignored.
            </p>
          </Panel>
          <Panel label="noteworthy launches">
            <p className="text-sm text-dim">
              Pairs younger than {ANOMALY.newPairHours}h with at least <b className="text-ink">${ANOMALY.newLaunchMinLiquidityUsd.toLocaleString("en-US")}</b> liquidity. New does not mean safe. Young pairs are high-risk by default.
            </p>
          </Panel>
          <Panel label="risk flags">
            <ul className="space-y-1 text-sm text-dim">
              <li>
                <b className="text-risk">MINT AUTH</b>: the mint authority is not revoked, so supply can grow.
              </li>
              <li>
                <b className="text-risk">FREEZE AUTH</b>: holder accounts can be frozen.
              </li>
              <li>
                <b className="text-warn">TOP-10 HEAVY</b>: the 10 largest accounts hold more than {ANOMALY.top10ConcentrationPct}% of supply. Pool vaults count as holders, so this can overstate concentration for thin tokens.
              </li>
              <li>
                <b className="text-risk">LP UNLOCKED</b>: less than {ANOMALY.lpLockedMinPct}% of LP is locked or burned.
              </li>
              <li>
                <b className="text-warn">NEW PAIR</b>: the pair is younger than {ANOMALY.newPairHours}h.
              </li>
              <li>
                <span className="text-faint">? dashed</span>: the source was unavailable. We show UNKNOWN rather than guess.
              </li>
            </ul>
          </Panel>
        </div>
      </section>

      <section id="labels" className="scroll-mt-24">
        <SectionHeader n={4} title="Verified vs speculation" />
        <div className="grid gap-3 md:grid-cols-2">
          <Panel label="verified">
            <TypeBadge type="VERIFIED" />
            <p className="mt-2 text-sm text-dim">
              A factual statement backed by specific data points or articles. The model has to cite the IDs of the facts it used, and the server turns those IDs into the source links you see. A VERIFIED item without a resolvable source is rejected.
            </p>
          </Panel>
          <Panel label="speculation">
            <TypeBadge type="SPECULATION" />
            <p className="mt-2 text-sm text-dim">Interpretation or context: what a fact might mean. It is clearly labeled and may be wrong. It never includes price predictions or recommendations.</p>
          </Panel>
          <Panel label="guards" className="md:col-span-2">
            <ul className="space-y-1.5 text-sm text-dim">
              <li>+ Every number in an item must match a number in the facts the model was given (rounding allowed). Invented or computed figures are rejected.</li>
              <li>+ Buy/sell language, price targets, &quot;opportunity&quot; and hype phrasing are rejected.</li>
              <li>+ Any token mentioned by symbol automatically gets its risk flags attached.</li>
              <li>+ If a section fails schema validation, the model gets one retry with the errors listed. If it fails again, the section is omitted and marked as omitted.</li>
              <li>+ If the model is unavailable, a facts-only brief is published from templates instead.</li>
            </ul>
          </Panel>
        </div>
      </section>

      <section>
        <SectionHeader n={5} title="Access & limits" />
        <Panel label="tiers">
          <ul className="space-y-1.5 text-sm text-dim">
            <li>
              FREE: the latest brief after a {LIMITS.freeDelayHours}h delay, top {LIMITS.freeItemsPerSection} items per section.
            </li>
            <li>HOLDER: today&apos;s full brief, archive, {LIMITS.maxTopics} personalized topics, {LIMITS.askPerDay.HOLDER} questions/day.</li>
            <li>
              WHALE: {LIMITS.askPerDay.WHALE} questions/day, {LIMITS.researchPerDay.WHALE} Deep Research reports/day, Telegram/email digest.
            </li>
            <li>Sign-in uses a signed message (SIWS): no transaction and no fees. Your balance is read on the server at login and re-checked every {LIMITS.balanceRecheckHours}h.</li>
            <li>All limits are enforced on the server with per-wallet daily counters that reset at 00:00 UTC.</li>
          </ul>
        </Panel>
      </section>

      <section id="disclaimers" className="scroll-mt-24">
        <SectionHeader n={6} title="Disclaimers" />
        <Panel label="read this">
          <ul className="space-y-2 text-sm text-dim">
            <li className="font-bold text-ink">{SITE.disclaimer}</li>
            <li>{APP_NAME} is an automated informational tool. Nothing here is investment, legal or tax advice, and nothing is a recommendation to buy, sell or hold any asset.</li>
            <li>Trending, high volume or a new launch does not mean an asset is good. Many new Solana tokens lose most or all of their value. Risk flags are partial heuristics. A token with no flags can still be dangerous.</li>
            <li>Data comes from third-party APIs and may be delayed, incomplete or wrong. SPECULATION items are model-written analysis and can be mistaken.</li>
            <li>
              {TOKEN.symbol} only unlocks product features. It carries no rights to revenue, profit, yield, dividends or buybacks, and {APP_NAME} makes no promises about its value.
            </li>
          </ul>
        </Panel>
      </section>
    </Container>
  );
}
