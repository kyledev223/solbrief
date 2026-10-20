import "server-only";
import { geminiDeps, type LlmDeps } from "./brief/generate";
import { getTopicSection } from "./brief/topics";
import { getStore } from "./db";
import type { RunKind, Store } from "./db/store";
import { deliverDigests } from "./delivery";
import { env } from "./env";
import { runPipeline } from "./pipeline/run";
import { topicKey, type FactsPack, type Topic } from "./types";

/** Topics generated inside the cron run; the rest are generated lazily on first view. */
const PREWARM_TOPICS = 6;

export async function prewarmTopics(store: Store, facts: FactsPack, deps: LlmDeps, max = PREWARM_TOPICS) {
  const users = await store.usersWithTopics("HOLDER");
  const counts = new Map<string, { topic: Topic; n: number }>();
  for (const u of users)
    for (const t of u.topics) {
      const k = topicKey(t);
      counts.set(k, { topic: t, n: (counts.get(k)?.n ?? 0) + 1 });
    }
  const top = [...counts.values()].sort((a, b) => b.n - a.n).slice(0, max);
  for (const { topic } of top) {
    await getTopicSection(store, topic, facts, deps, env.rpcUrl).catch((e) => console.error("[prewarm]", topicKey(topic), e));
  }
  return top.length;
}

export const pipelineKeys = () => ({ rpcUrl: env.rpcUrl, jupiterKey: env.jupiterKey, coingeckoKey: env.coingeckoKey });

export async function runJob(kind: RunKind, opts: { force?: boolean } = {}) {
  const store = getStore();
  const deps = geminiDeps();
  return runPipeline(kind, {
    store,
    deps,
    keys: pipelineKeys(),
    force: opts.force,
    afterPublish: async (brief, facts) => {
      const warmed = await prewarmTopics(store, facts, deps);
      const delivery = await deliverDigests(store, brief);
      console.log(`[jobs] prewarmed ${warmed} topics; digests`, delivery);
    },
  });
}
