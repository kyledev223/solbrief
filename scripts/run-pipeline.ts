/**
 * Run the pipeline locally against live data.
 *
 *   npm run pipeline                 # manual run: fetch + anomalies + brief
 *   npm run pipeline -- --kind refresh
 *   npm run pipeline -- --no-llm     # force the facts-only path
 *
 * Uses Supabase when SUPABASE_URL is set in .env.local, otherwise ./.data.
 */
import fs from "node:fs/promises";
import { getStore } from "../src/lib/db";
import { env } from "../src/lib/env";
import { geminiDeps } from "../src/lib/brief/generate";
import { runPipeline } from "../src/lib/pipeline/run";
import type { RunKind } from "../src/lib/db/store";

const args = process.argv.slice(2);
const kind = (args[args.indexOf("--kind") + 1] as RunKind | undefined) ?? "manual";
const noLlm = args.includes("--no-llm");

async function main() {
  const store = getStore();
  const deps = geminiDeps();
  if (noLlm) deps.available = false;
  console.log(`▶ pipeline kind=${args.includes("--kind") ? kind : "manual"} store=${store.kind} llm=${deps.available ? "gemini" : "off (facts-only)"}`);

  const res = await runPipeline(args.includes("--kind") ? kind : "manual", {
    store,
    deps,
    keys: { rpcUrl: env.rpcUrl, jupiterKey: env.jupiterKey, coingeckoKey: env.coingeckoKey },
  });

  console.log(`\n■ status=${res.status} run=${res.runId}`);
  console.log(JSON.stringify(res.stats, null, 2));
  if (res.generationLog) {
    console.log("\ngeneration log:");
    for (const [s, l] of Object.entries(res.generationLog)) console.log(`  ${s}: ${l.join(" | ") || "ok"}`);
  }
  if (res.brief) {
    await fs.mkdir(".data", { recursive: true });
    await fs.writeFile(".data/last-brief.json", JSON.stringify(res.brief, null, 2));
    console.log(`\n${res.brief.headline}`);
    for (const s of res.brief.sections) {
      console.log(`\n## ${s.title} (${s.items.length})`);
      for (const i of s.items.slice(0, 4)) console.log(`  [${i.type}] ${i.headline}${i.sources[0] ? `  <${i.sources[0].url}>` : ""}`);
    }
    if (res.brief.omitted.length) console.log(`\nomitted: ${res.brief.omitted.join(", ")}`);
    console.log("\nfull brief → .data/last-brief.json");
  }
  if (res.status === "failed") process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
