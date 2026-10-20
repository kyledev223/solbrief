/**
 * Deterministic checks applied to every LLM item before it is published.
 * The model is instructed to follow these rules; this code enforces them.
 */
import type { BriefItem, LlmItem, Source } from "./schema";

// ── 1. No advice, predictions or hype ────────────────────────────────────

const BANNED: Array<[RegExp, string]> = [
  [/\b(you|investors?|traders?|holders?|readers?|users?|one)\s+(should|must|might want to|may want to|could consider)\s+(buy|sell|hold|ape|enter|exit|accumulate|short|long|invest)/i, "recommendation"],
  [/\b(buy|sell|hold|accumulate)(ing)?\s+(now|signal|zone|opportunit|the dip|before)/i, "recommendation"],
  [/\b(strong|good|great|clear)\s+(buy|sell)\b/i, "recommendation"],
  [/\bopportunit(y|ies)\b/i, "opportunity language"],
  [/\b(price\s+(target|prediction|forecast)|target\s+price)\b/i, "price prediction"],
  [/\b(will|could|may|might|set to|poised to|likely to|expected to|about to)\s+(reach|hit|moon|pump|explode|skyrocket|soar|rally|double|triple|10x|100x|1000x|go up|rise to|climb to|break out)\b/i, "price prediction"],
  [/\b\d+\s?x\s+(potential|gains?|returns?|upside)\b/i, "price prediction"],
  [/\b(to the moon|mooning|moonshot|next\s+\d+x|hidden gem|\bgem\b|undervalued|overvalued|don'?t miss|not to be missed|guaranteed|risk[- ]free|easy money|bullish|bearish)\b/i, "hype language"],
];

export function bannedPhrases(text: string): string[] {
  return BANNED.filter(([re]) => re.test(text)).map(([re, label]) => `${label}: "${text.match(re)?.[0]}"`);
}

// ── 2. Numeric grounding ─────────────────────────────────────────────────

export interface NumberToken {
  raw: string;
  value: number; // absolute value with unit multiplier applied
  halfUnit: number; // display precision tolerance
  unit: "" | "%" | "x" | "$";
}

const MULT: Record<string, number> = { k: 1e3, thousand: 1e3, m: 1e6, million: 1e6, mn: 1e6, b: 1e9, bn: 1e9, billion: 1e9 };

export function extractNumbers(text: string): NumberToken[] {
  const cleaned = text
    .replace(/\b\d{4}-\d{2}-\d{2}(T[\d:.]+Z?)?\b/g, " ") // ISO dates
    .replace(/\b\d{1,2}:\d{2}(\s?UTC)?\b/gi, " ") // times
    .replace(/\b[1-9A-HJ-NP-Za-km-z]{25,}\b/g, " ") // base58 addresses
    .replace(/\btop[- ]10\b/gi, " ")
    .replace(/\b(24|48|72)\s?-?\s?(h|hr|hrs|hour|hours)\b/gi, " ")
    .replace(/\b7[- ]day\b/gi, " ");
  const re = /(?<![\w.])(\$)?(\d[\d,]*(?:\.\d+)?)\s?(thousand|million|billion|mn|bn|k|m|b)?\s?(%|x)?(?![\w])/gi;
  const out: NumberToken[] = [];
  for (const m of cleaned.matchAll(re)) {
    const [raw, dollar, digits, mult, suffix] = m;
    const n = Number(digits.replace(/,/g, ""));
    if (!Number.isFinite(n)) continue;
    const decimals = digits.includes(".") ? digits.split(".")[1].length : 0;
    const k = mult ? MULT[mult.toLowerCase()] : 1;
    out.push({
      raw: raw.trim(),
      value: n * k,
      halfUnit: 0.5 * 10 ** -decimals * k,
      unit: suffix === "%" ? "%" : suffix?.toLowerCase() === "x" ? "x" : dollar || mult ? "$" : "",
    });
  }
  return out;
}

/** All numbers present anywhere in the facts given to the model. */
export function collectAllowedNumbers(facts: unknown): number[] {
  const out: number[] = [];
  const walk = (v: unknown) => {
    if (typeof v === "number" && Number.isFinite(v)) out.push(Math.abs(v));
    else if (typeof v === "string") for (const t of extractNumbers(v)) out.push(t.value);
    else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === "object") Object.values(v).forEach(walk);
  };
  walk(facts);
  return out;
}

export function isGrounded(t: NumberToken, allowed: number[]): boolean {
  // Bare small integers are counts/ordinals ("3 new pairs", "top 5"), not data.
  if (t.unit === "" && Number.isInteger(t.value) && (t.value <= 31 || (t.value >= 2000 && t.value <= 2100))) return true;
  return allowed.some((a) => Math.abs(t.value - a) <= Math.max(t.halfUnit, 0.015 * Math.max(a, t.value)));
}

export function ungroundedNumbers(text: string, allowed: number[]): string[] {
  return extractNumbers(text)
    .filter((t) => !isGrounded(t, allowed))
    .map((t) => t.raw);
}

// ── 3. Citations & token mentions ────────────────────────────────────────

export interface CheckContext {
  allowedNumbers: number[];
  factIndex: Map<string, Source>;
  /** symbol → token id, for auto-tagging mentions the model forgot to list */
  symbols: Map<string, string>;
  knownTokenIds: Set<string>;
  /** Additional outlets for a fact id (same story, other publishers). */
  relatedSources?: Map<string, Source[]>;
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const SKIP_SYMBOLS = new Set(["SOL", "USDC", "USDT", "WSOL", "THE", "AND", "FOR", "NEW", "ALL", "ONE", "TOP"]);

export function mentionedTokenIds(text: string, symbols: Map<string, string>): string[] {
  const ids: string[] = [];
  for (const [sym, id] of symbols) {
    if (sym.length < 3 || SKIP_SYMBOLS.has(sym.toUpperCase())) continue;
    if (new RegExp(`(?<![\\w$])\\$?${escapeRe(sym)}(?![\\w])`).test(text)) ids.push(id);
  }
  return ids;
}

export interface CheckedItem {
  item: BriefItem;
  violations: string[];
}

export function checkItem(item: LlmItem, ctx: CheckContext): CheckedItem {
  const violations: string[] = [];
  const text = `${item.headline}\n${item.body}`;

  for (const b of bannedPhrases(text)) violations.push(`forbidden ${b}`);
  const bad = ungroundedNumbers(text, ctx.allowedNumbers);
  if (bad.length) violations.push(`numbers not present in facts: ${bad.slice(0, 5).join(", ")}`);

  const unknownFacts = item.factIds.filter((id) => !ctx.factIndex.has(id));
  if (unknownFacts.length) violations.push(`unknown fact ids: ${unknownFacts.slice(0, 5).join(", ")}`);
  const unknownTokens = item.tokenIds.filter((id) => !ctx.knownTokenIds.has(id));
  if (unknownTokens.length) violations.push(`unknown token ids: ${unknownTokens.slice(0, 5).join(", ")}`);

  const factIds = [...new Set(item.factIds.filter((id) => ctx.factIndex.has(id)))];
  // Every mentioned token carries its risk flags, whether or not the model listed it.
  const tokenIds = [...new Set([...item.tokenIds.filter((id) => ctx.knownTokenIds.has(id)), ...mentionedTokenIds(text, ctx.symbols)])];

  const seen = new Set<string>();
  const sources = factIds
    .flatMap((id) => [ctx.factIndex.get(id)!, ...(ctx.relatedSources?.get(id) ?? [])])
    .filter((s) => (seen.has(s.url) ? false : (seen.add(s.url), true)));
  if (item.type === "VERIFIED" && sources.length === 0) violations.push("VERIFIED item has no resolvable source");

  return {
    item: { type: item.type, headline: item.headline.trim(), body: item.body.trim(), factIds, tokenIds, sources },
    violations,
  };
}
