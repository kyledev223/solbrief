import { TOPIC_PRESETS } from "@/config/site";
import type { Store } from "../db/store";
import { RpcClient } from "../fetchers/rpc";
import { amount, shortAddr } from "../format";
import type { FactsPack, Topic } from "../types";
import { topicKey } from "../types";
import { compactAnomaly, compactNews, compactToken } from "./facts";
import { runLlmSection, type LlmDeps } from "./generate";
import type { BriefItem, BriefSection } from "./schema";
import { templateItems } from "./templates";

export function topicLabel(t: Topic): string {
  if (t.kind === "preset") return TOPIC_PRESETS.find((p) => p.key === t.key)?.label ?? t.key;
  if (t.kind === "wallet") return `Wallet ${shortAddr(t.value)}`;
  return t.value;
}

const wordMatch = (hay: string, kw: string) => new RegExp(`(^|[^a-z0-9])${kw.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^a-z0-9]|$)`).test(hay);

/** Facts relevant to a preset/project topic (keyword match over today's facts). */
export function topicFacts(t: Exclude<Topic, { kind: "wallet" }>, f: FactsPack) {
  const keywords = t.kind === "preset" ? [...(TOPIC_PRESETS.find((p) => p.key === t.key)?.keywords ?? [t.key])] : [t.value.trim()];
  const hit = (s: string) => keywords.some((k) => wordMatch(s.toLowerCase(), k));
  const news = f.news.filter((n) => hit(`${n.title} ${n.summary}`));
  let tokens = f.tokens.filter((tk) => hit(`${tk.symbol} ${tk.name}`));
  if (t.kind === "preset" && t.key === "memecoins") {
    const memeDex = f.tokens.filter((tk) => /pump|moonshot|launchlab|bonk/i.test(tk.dexId));
    tokens = [...new Map([...tokens, ...memeDex].map((x) => [x.id, x])).values()];
  }
  const ids = new Set(tokens.map((x) => x.id));
  const anomalies = f.anomalies.filter((a) => ids.has(a.tokenId));
  return { news, tokens, anomalies };
}

async function walletSection(addr: string, f: FactsPack, rpcUrl: string): Promise<BriefItem[]> {
  const holdings = await new RpcClient(rpcUrl).walletTokens(addr);
  const byMint = new Map(f.tokens.map((t) => [t.mint, t]));
  const solscan = { label: `Solscan · ${shortAddr(addr)}`, url: `https://solscan.io/account/${addr}` };
  const flagged = holdings.filter((h) => byMint.has(h.mint));
  const items: BriefItem[] = flagged.map((h) => {
    const t = byMint.get(h.mint)!;
    const yes = t.risk.filter((r) => r.state === "yes").map((r) => r.label.toLowerCase());
    return {
      type: "VERIFIED",
      headline: `Holds ${t.symbol}, which appears in today's signals`,
      body: `Balance ${amount(h.amount)} ${t.symbol}. Today's signals: ${t.signals.join(", ").toLowerCase().replace(/_/g, " ") || "tracked token"}.${yes.length ? ` Risk flags: ${yes.join(", ")}.` : ""}`,
      factIds: [t.id],
      tokenIds: [t.id],
      sources: [solscan, { label: `DexScreener · ${t.symbol}`, url: t.pairUrl }],
    };
  });
  items.unshift({
    type: "VERIFIED",
    headline: `${holdings.length} token position${holdings.length === 1 ? "" : "s"}, ${flagged.length} in today's signals`,
    body: flagged.length
      ? "Positions below overlap with tokens flagged in today's brief."
      : "None of this wallet's token positions appear in today's launches, unusual moves or volume leaders.",
    factIds: [],
    tokenIds: [],
    sources: [solscan],
  });
  return items;
}

/** One personalized section, cached per (date, topic) so cost scales with topics, not users. */
export async function getTopicSection(store: Store, t: Topic, f: FactsPack, deps: LlmDeps, rpcUrl: string): Promise<BriefSection> {
  const key = topicKey(t);
  const cached = await store.getTopicSection(f.date, key);
  if (cached) return cached;

  const title = topicLabel(t);
  let items: BriefItem[] = [];

  if (t.kind === "wallet") {
    items = await walletSection(t.value, f, rpcUrl);
  } else {
    const tf = topicFacts(t, f);
    if (tf.news.length || tf.tokens.length) {
      const sf = { tokens: tf.tokens.map(compactToken), anomalies: tf.anomalies.map(compactAnomaly), news: tf.news.map(compactNews) };
      const goal = `Personalized section for a reader following "${title}". Cover only the facts provided, most significant first. Include risk flags for any token.`;
      if (deps.available) {
        try {
          const out = await runLlmSection({ id: `topic:${key}`, title, goal, maxItems: 4, date: f.date }, f, sf, deps);
          items = out.section?.items ?? [];
        } catch {
          items = [];
        }
      }
      if (!items.length) {
        // facts-only: reuse the ecosystem/launch templates over the matched subset
        const sub: FactsPack = { ...f, news: tf.news, tokens: tf.tokens, anomalies: tf.anomalies, launches: f.launches.filter((id) => tf.tokens.some((x) => x.id === id)) };
        items = [...(templateItems("unusual", sub) ?? []), ...(templateItems("launches", sub) ?? []), ...(templateItems("ecosystem", sub) ?? [])].slice(0, 4);
      }
    }
  }

  const section: BriefSection = { id: `topic:${key}`, title, items };
  await store.putTopicSection(f.date, key, section).catch((e) => console.error("[topics] cache write failed", e));
  return section;
}
