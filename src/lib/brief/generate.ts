import { ANOMALY, SITE } from "@/config/site";
import { pct, usd } from "../format";
import { generateJson, hasLlm, LlmUnavailableError, LlmValidationError, type GenerateOpts, type GenerateResult } from "../llm/gemini";
import type { FactsPack } from "../types";
import { buildFactIndex } from "./facts";
import { checkItem, collectAllowedNumbers, type CheckContext } from "./guards";
import { SECTION_SPECS, SYSTEM_PROMPT, sectionFacts, sectionPrompt } from "./prompts";
import { BriefSchema, LlmSectionSchema, SECTION_IDS, SECTION_TITLES, type Brief, type BriefItem, type BriefSection, type SectionId } from "./schema";
import { templateItems } from "./templates";
import type { z } from "zod";

/** Injectable LLM so generation logic is testable without the network. */
export interface LlmDeps {
  available: boolean;
  generate: <T>(schema: z.ZodType<T>, opts: GenerateOpts) => Promise<GenerateResult<T>>;
}

export const geminiDeps = (): LlmDeps => ({ available: hasLlm(), generate: generateJson });

/** Config numbers the prompts mention, so restating a threshold is "grounded". */
const THRESHOLD_NUMBERS = [
  ANOMALY.volumeMultiple,
  ANOMALY.liquidityChangePct,
  ANOMALY.newLaunchMinLiquidityUsd,
  ANOMALY.newPairHours,
  ANOMALY.top10ConcentrationPct,
  ANOMALY.lpLockedMinPct,
  7,
  24,
];

export function checkContext(facts: FactsPack, sectionFactsJson: unknown): CheckContext {
  return {
    allowedNumbers: [...collectAllowedNumbers(sectionFactsJson), ...THRESHOLD_NUMBERS],
    factIndex: buildFactIndex(facts),
    symbols: new Map(facts.tokens.map((t) => [t.symbol, t.id])),
    knownTokenIds: new Set(facts.tokens.map((t) => t.id)),
    relatedSources: new Map(facts.news.map((n) => [n.id, (n.related ?? []).map((r) => ({ label: r.source, url: r.url }))])),
  };
}

export type SectionOutcome =
  | { status: "ok" | "empty" | "fallback"; section: BriefSection; model: string | null; log: string[] }
  | { status: "omitted"; section: null; model: string | null; log: string[] };

export interface LlmSectionSpec {
  id: string;
  title: string;
  goal: string;
  maxItems: number;
  date: string;
}

/**
 * Generate → zod-validate → guard. On a schema failure or guard violation the
 * model gets one retry with the problems listed. After that, schema failures
 * omit the section; items that still violate a guard are dropped.
 */
export async function runLlmSection(spec: LlmSectionSpec, facts: FactsPack, sf: Record<string, unknown>, deps: LlmDeps): Promise<SectionOutcome> {
  const ctx = checkContext(facts, sf);
  const log: string[] = [];
  let feedback: string[] | undefined;

  for (let attempt = 0; attempt < 2; attempt++) {
    let res: GenerateResult<z.infer<typeof LlmSectionSchema>>;
    try {
      res = await deps.generate(LlmSectionSchema, {
        system: SYSTEM_PROMPT,
        prompt: sectionPrompt(spec, sf, spec.date, feedback),
      });
    } catch (err) {
      if (err instanceof LlmValidationError) {
        log.push(`attempt ${attempt + 1}: ${err.message}: ${err.issues.join("; ")}`);
        if (attempt === 0) {
          feedback = err.issues;
          continue;
        }
        return { status: "omitted", section: null, model: null, log };
      }
      log.push(`attempt ${attempt + 1}: ${err instanceof Error ? err.message : String(err)}`);
      throw err instanceof LlmUnavailableError ? err : new LlmUnavailableError(String(err));
    }

    const checked = res.data.items.slice(0, spec.maxItems).map((i) => checkItem(i, ctx));
    const bad = checked.filter((c) => c.violations.length);
    if (bad.length && attempt === 0) {
      feedback = bad.flatMap((c) => c.violations.map((v) => `item "${c.item.headline.slice(0, 60)}": ${v}`));
      log.push(`attempt 1: ${feedback.length} guard violation(s)`);
      continue;
    }
    if (bad.length) log.push(`attempt 2: dropped ${bad.length} item(s) still violating guards`);
    const good = checked.filter((c) => !c.violations.length).map((c) => c.item);
    if (!good.length && res.data.items.length) return { status: "omitted", section: null, model: res.model, log };
    return { status: good.length ? "ok" : "empty", section: { id: spec.id, title: spec.title, items: good }, model: res.model, log };
  }
  return { status: "omitted", section: null, model: null, log };
}

export async function generateSection(id: SectionId, facts: FactsPack, deps: LlmDeps, prior: Array<{ section: string; item: BriefItem }> = []): Promise<SectionOutcome> {
  const title = SECTION_TITLES[id];
  const sf = sectionFacts(id, facts, prior);
  if (!sf) return { status: "empty", section: { id, title, items: [] }, model: null, log: ["no qualifying facts"] };

  const fallback = (log: string[]): SectionOutcome => {
    const items = templateItems(id, facts);
    return items ? { status: "fallback", section: { id, title, items }, model: null, log } : { status: "omitted", section: null, model: null, log };
  };
  if (!deps.available) return fallback(["LLM not configured: facts-only"]);

  try {
    return await runLlmSection({ id, title, goal: SECTION_SPECS[id].goal, maxItems: SECTION_SPECS[id].maxItems, date: facts.date }, facts, sf, deps);
  } catch (err) {
    // API unreachable (not a validation failure) → deterministic facts-only items
    return fallback([`LLM unavailable: ${err instanceof Error ? err.message.slice(0, 200) : String(err)}`]);
  }
}

export function deterministicHeadline(f: FactsPack): string {
  const parts: string[] = [];
  if (f.market.sol) parts.push(`SOL ${usd(f.market.sol.priceUsd, { compact: false })} (${pct(f.market.sol.change24hPct)})`);
  parts.push(`${f.stats.anomalies} unusual move${f.stats.anomalies === 1 ? "" : "s"}`);
  parts.push(`${f.stats.newLaunches} noteworthy launch${f.stats.newLaunches === 1 ? "" : "es"}`);
  parts.push(`${f.news.length} ecosystem stor${f.news.length === 1 ? "y" : "ies"}`);
  return parts.join(" · ");
}

export interface GeneratedBrief {
  brief: Brief;
  log: Record<string, string[]>;
}

export async function generateBrief(facts: FactsPack, deps: LlmDeps): Promise<GeneratedBrief> {
  const sections: BriefSection[] = [];
  const omitted: string[] = [];
  const log: Record<string, string[]> = {};
  const prior: Array<{ section: string; item: BriefItem }> = [];
  let model: string | null = null;
  let usedLlm = false;

  for (const id of SECTION_IDS) {
    const out = await generateSection(id, facts, deps, id === "why" ? prior : []);
    log[id] = out.log;
    if (out.model) {
      model = out.model;
      usedLlm = true;
    }
    if (out.status === "omitted") {
      // "why" with nothing to analyze is simply empty, not a failure
      if (!(id === "why" && !prior.length)) omitted.push(id);
      continue;
    }
    sections.push(out.section);
    if (id !== "why") prior.push(...out.section.items.map((item) => ({ section: SECTION_TITLES[id], item })));
  }

  const brief: Brief = {
    date: facts.date,
    headline: deterministicHeadline(facts),
    sections,
    omitted,
    mode: usedLlm ? "llm" : "facts-only",
    model,
    generatedAt: new Date().toISOString(),
    disclaimer: SITE.disclaimer,
  };
  return { brief: BriefSchema.parse(brief), log };
}
