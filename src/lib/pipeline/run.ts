import feedsJson from "@/config/feeds.json";
import { generateBrief, geminiDeps, type LlmDeps } from "../brief/generate";
import type { Brief } from "../brief/schema";
import type { RunKind, Store } from "../db/store";
import { FetchContext } from "../fetchers/context";
import type { FeedConfig } from "../fetchers/types";
import type { FactsPack, RunStats } from "../types";
import { analyze } from "./analyze";
import { collect, persistCollected } from "./collect";

export interface PipelineKeys {
  rpcUrl: string;
  jupiterKey: string;
  coingeckoKey: string;
}

export interface PipelineOpts {
  store: Store;
  keys: PipelineKeys;
  deps?: LlmDeps;
  now?: number;
  /** Regenerate even if today's brief already exists (daily runs are idempotent). */
  force?: boolean;
  /** Post-publish work (topic pre-warm, digest delivery). Errors are logged only. */
  afterPublish?: (brief: Brief, facts: FactsPack) => Promise<void>;
}

export interface PipelineResult {
  runId: string;
  status: "success" | "partial" | "failed" | "skipped";
  stats: Partial<RunStats>;
  brief?: Brief;
  facts?: FactsPack;
  generationLog?: Record<string, string[]>;
}

async function loadFeeds(store: Store): Promise<FeedConfig[]> {
  try {
    const feeds = await store.listFeeds();
    if (feeds.length) return feeds;
  } catch (err) {
    console.error("[pipeline] listFeeds failed, using defaults", err);
  }
  return feedsJson.feeds as FeedConfig[];
}

/**
 * daily   → full fetch + anomaly pass + brief generation (idempotent per UTC day)
 * manual  → same as daily but always regenerates
 * refresh → fetch + anomaly pass only (keeps snapshots/pulse fresh every 4h)
 */
export async function runPipeline(kind: RunKind, opts: PipelineOpts): Promise<PipelineResult> {
  const { store } = opts;
  const now = opts.now ?? Date.now();
  const today = new Date(now).toISOString().slice(0, 10);

  if (kind === "daily" && !opts.force) {
    const existing = await store.getBrief(today).catch(() => null);
    if (existing) return { runId: existing.runId ?? "", status: "skipped", stats: { briefDate: today, briefPublished: true } };
  }

  const started = Date.now();
  const runId = await store.createRun(kind);
  const ctx = new FetchContext();
  let stats: Partial<RunStats> = {};

  try {
    const feeds = await loadFeeds(store);
    const collected = await collect(ctx, feeds, { coingeckoKey: opts.keys.coingeckoKey });
    await persistCollected(store, runId, collected);

    const facts = await analyze(ctx, store, collected, { runId, now, rpcUrl: opts.keys.rpcUrl, jupiterKey: opts.keys.jupiterKey, light: kind === "refresh" });
    stats = { ...facts.stats };
    await store.insertRawSnapshot(runId, "facts", facts).catch((e) => console.error("[pipeline] facts snapshot failed", e));

    let brief: Brief | undefined;
    let generationLog: Record<string, string[]> | undefined;
    if (kind !== "refresh") {
      if (!collected.pairs.length && !collected.news.length && !collected.market) throw new Error("every data source failed; not publishing an empty brief");
      const gen = await generateBrief(facts, opts.deps ?? geminiDeps());
      brief = gen.brief;
      generationLog = gen.log;
      await store.upsertBrief({
        briefDate: facts.date,
        status: "published",
        publishedAt: new Date().toISOString(),
        content: brief,
        facts,
        model: brief.model,
        omittedSections: brief.omitted,
        runId,
      });
      stats = { ...stats, briefPublished: true, briefDate: facts.date, omittedSections: brief.omitted };
      if (opts.afterPublish) await opts.afterPublish(brief, facts).catch((e) => console.error("[pipeline] afterPublish failed", e));
    }

    stats.sourcesOk = ctx.logs.filter((l) => l.ok).length;
    stats.sourcesFailed = ctx.failedSources;
    stats.durationMs = Date.now() - started;
    const status = ctx.failedSources.length ? "partial" : "success";
    await store.insertFetchLogs(runId, ctx.logs).catch((e) => console.error("[pipeline] insertFetchLogs failed", e));
    await store.finishRun(runId, status, stats);
    if (kind !== "refresh") await store.prune(14).catch(() => undefined);
    return { runId, status, stats, brief, facts, generationLog };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[pipeline] run failed:", message);
    stats.durationMs = Date.now() - started;
    stats.sourcesFailed = ctx.failedSources;
    await store.insertFetchLogs(runId, ctx.logs).catch(() => undefined);
    await store.finishRun(runId, "failed", stats, message).catch(() => undefined);
    return { runId, status: "failed", stats };
  }
}
