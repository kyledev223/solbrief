import { connection } from "next/server";
import { LIMITS, SITE, TOKEN } from "@/config/site";
import { SECTION_TITLES, type SectionId } from "@/lib/brief/schema";
import { safeBrief, safeLatestBrief } from "@/lib/data";
import { utcDateTime } from "@/lib/format";
import { briefForTier, canViewBrief, tierRequirement, visibleBefore } from "@/lib/tiers";
import { getViewer } from "@/lib/viewer";
import { SectionView, type MentionToken } from "./BriefView";
import { PersonalSections } from "./PersonalSections";
import { Gate } from "./tiers";
import { TokenCard } from "./TokenCard";
import { CmdLink, Panel } from "./ui";

const OMIT_REASON: Record<string, string> = {
  why: "Analysis unavailable for this brief (model offline or output failed validation).",
};

export async function BriefPage({ date }: { date?: string }) {
  await connection();
  const viewer = await getViewer();
  const latestFree = await safeLatestBrief(visibleBefore("FREE"));

  let row = null;
  if (date) {
    row = await safeBrief(date);
    if (!row) return <Empty text={`No brief was published for ${date}.`} />;
    if (!canViewBrief(viewer.tier, row.publishedAt, undefined, latestFree?.briefDate ?? null, row.briefDate)) {
      return (
        <Gate need="HOLDER" title={`The ${date} brief is in the holder archive`}>
          <p className="mt-2 text-sm text-dim">
            Free access covers the most recent brief after a {LIMITS.freeDelayHours}h delay{latestFree ? ` (currently ${latestFree.briefDate})` : ""}.
          </p>
          {latestFree && (
            <div className="mt-3">
              <CmdLink href={`/brief/${latestFree.briefDate}`}>read {latestFree.briefDate}</CmdLink>
            </div>
          )}
        </Gate>
      );
    }
  } else {
    row = viewer.tier === "FREE" ? latestFree : await safeLatestBrief();
    if (!row) {
      const anyBrief = viewer.tier === "FREE" ? await safeLatestBrief() : null;
      return anyBrief ? (
        <Gate need="HOLDER" title="Today's brief is live for holders">
          <p className="mt-2 text-sm text-dim">Free readers get each brief {LIMITS.freeDelayHours}h after it publishes.</p>
        </Gate>
      ) : (
        <Empty text="No brief has been published yet. The first one lands after the next 12:00 UTC run." />
      );
    }
  }

  const brief = briefForTier(row.content, viewer.tier);
  const tokens = new Map<string, MentionToken>(row.facts.tokens.map((t) => [t.id, t]));
  const isDelayed = viewer.tier === "FREE";
  const featured = row.facts.tokens.filter((t) => t.signals.includes("NEW_LAUNCH") || t.signals.includes("VOLUME_SPIKE") || t.signals.includes("LIQUIDITY_MOVE")).slice(0, isDelayed ? 3 : 9);

  return (
    <article className="space-y-12">
      <header className="space-y-3">
        <div className="text-xs text-faint">
          <span className="text-violet">~/brief/</span>
          {row.briefDate}
        </div>
        <h1 className="text-3xl font-extrabold leading-tight tracking-tight sm:text-4xl">
          <span className="text-gradient">{row.briefDate}</span> · daily brief
        </h1>
        <p className="text-sm text-dim">{brief.headline}</p>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-faint">
          <span>published {utcDateTime(row.publishedAt)}</span>
          <span>mode {brief.mode === "llm" ? `llm · ${brief.model}` : "facts-only"}</span>
          <span>{row.facts.stats.pairsScanned} pairs scanned</span>
          <span>{row.facts.stats.sourcesOk} sources ok</span>
        </div>
        {isDelayed && (
          <div className="rounded-md border border-violet/40 bg-violet/5 px-4 py-3 text-sm text-dim">
            Free view: this brief is {LIMITS.freeDelayHours}h+ old and limited to the top {LIMITS.freeItemsPerSection} items per section. Holding {tierRequirement("HOLDER")} unlocks today&apos;s full brief at publish time.
          </div>
        )}
      </header>

      {featured.length > 0 && (
        <section>
          <h2 className="mb-3 text-xs uppercase tracking-widest text-faint">tokens in today&apos;s signals</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {featured.map((t) => (
              <TokenCard key={t.id} t={t} />
            ))}
          </div>
        </section>
      )}

      {brief.sections.map((s, i) => (
        <SectionView key={s.id} n={i + 1} section={s} tokens={tokens} />
      ))}

      {brief.omitted.length > 0 && (
        <Panel label="omitted sections">
          <ul className="space-y-1 text-sm text-dim">
            {brief.omitted.map((id) => (
              <li key={id}>
                <span className="text-warn">!</span> {SECTION_TITLES[id as SectionId] ?? id}: {OMIT_REASON[id] ?? "the model's output failed validation twice, so this section was left out rather than published unchecked."}
              </li>
            ))}
          </ul>
        </Panel>
      )}

      {brief.truncated && (
        <Gate need="HOLDER" title="More items are in the full brief">
          <p className="mt-2 text-sm text-dim">Holders see every item, the archive, personalized topics and Ask the Brief.</p>
        </Gate>
      )}

      {viewer.tier !== "FREE" && !date && <PersonalSections startAt={brief.sections.length + 1} />}

      <footer className="border-t border-line pt-4 text-xs text-faint">
        <p className="font-bold text-dim">{SITE.disclaimer}</p>
        <p className="mt-1">
          VERIFIED items cite the data point or article they rest on. SPECULATION items are analysis. Risk flags come from on-chain checks and may be UNKNOWN when a source was unavailable. Holding {TOKEN.symbol} gives access to features only.
        </p>
      </footer>
    </article>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <Panel label="brief">
      <p className="text-sm text-dim">{text}</p>
      <div className="mt-3">
        <CmdLink href="/archive">/archive</CmdLink>
      </div>
    </Panel>
  );
}
