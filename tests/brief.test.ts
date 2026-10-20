import { describe, it, expect, vi } from "vitest";
import { z } from "zod";
import { generateBrief, generateSection, type LlmDeps } from "@/lib/brief/generate";
import { bannedPhrases, checkItem, extractNumbers, ungroundedNumbers, collectAllowedNumbers, mentionedTokenIds } from "@/lib/brief/guards";
import { BriefSchema, LlmSectionSchema, LlmItemSchema } from "@/lib/brief/schema";
import { LlmUnavailableError, LlmValidationError, toGeminiSchema } from "@/lib/llm/gemini";
import { computeRiskFlags } from "@/lib/anomaly/engine";
import type { FactsPack, TokenFact } from "@/lib/types";
import { checkContext } from "@/lib/brief/generate";

const token: TokenFact = {
  id: "tok:MINTAAA",
  mint: "MINTAAA",
  symbol: "BONKX",
  name: "Bonk X",
  pairAddress: "PAIRAAA",
  pairUrl: "https://dexscreener.com/solana/pairaaa",
  dexId: "pumpswap",
  ageHours: 5.2,
  priceUsd: 0.00123,
  marketCapUsd: 1_230_000,
  fdvUsd: 1_230_000,
  volume24hUsd: 4_560_000,
  liquidityUsd: 78_900,
  priceChange24hPct: 312.4,
  buys24h: 100,
  sells24h: 80,
  jupiterVerified: false,
  risk: computeRiskFlags({ mintAuthority: "AUTH", freezeAuthority: null, top10Pct: 61.2, lpLockedPct: 100, ageHours: 5.2 }),
  riskCount: 3,
  signals: ["NEW_LAUNCH"],
};

const facts: FactsPack = {
  date: "2026-10-19",
  generatedAt: "2026-10-19T12:00:00.000Z",
  runId: "run1",
  market: {
    id: "mkt:sol",
    url: "https://www.coingecko.com/en/coins/solana",
    sol: { priceUsd: 104.69, change24hPct: -0.37, volume24hUsd: 2_555_812_107, marketCapUsd: 61_712_622_831 },
    categories: [],
    ecosystem: [],
  },
  tokens: [token],
  anomalies: [
    {
      id: "anom:new:MINTAAA",
      kind: "NEW_LAUNCH",
      tokenId: token.id,
      mint: token.mint,
      symbol: token.symbol,
      value: 78_900,
      baseline: null,
      ratio: null,
      changePct: null,
      baselineSource: null,
      url: token.pairUrl,
      summary: "new pair 5.2h old with $78.9K liquidity",
    },
  ],
  launches: [token.id],
  gainers: [token.id],
  topVolume: [token.id],
  news: [
    {
      id: "news:1",
      source: "Solana News",
      title: "Firedancer reaches mainnet milestone",
      url: "https://solana.com/news/firedancer",
      publishedAt: "2026-10-19T08:00:00Z",
      summary: "Validator client update.",
      related: [{ source: "The Block", url: "https://theblock.co/firedancer" }],
    },
  ],
  stats: { pairsScanned: 10, tokensEnriched: 1, anomalies: 0, newLaunches: 1, newsItems: 1, sourcesOk: 5, sourcesFailed: [] },
};

const verified = (over: Partial<z.infer<typeof LlmItemSchema>> = {}) => ({
  type: "VERIFIED" as const,
  headline: "BONKX launched with $78.9K liquidity",
  body: "The pair is 5.2h old with $4.56M 24h volume. Mint authority is still enabled.",
  factIds: ["tok:MINTAAA"],
  tokenIds: ["tok:MINTAAA"],
  ...over,
});

describe("brief JSON schema", () => {
  it("requires a fact id on VERIFIED items", () => {
    expect(LlmItemSchema.safeParse(verified()).success).toBe(true);
    expect(LlmItemSchema.safeParse(verified({ factIds: [] })).success).toBe(false);
    expect(LlmItemSchema.safeParse({ ...verified(), type: "SPECULATION", factIds: [] }).success).toBe(true);
  });

  it("rejects unknown types and missing fields", () => {
    expect(LlmItemSchema.safeParse({ ...verified(), type: "FACT" }).success).toBe(false);
    expect(LlmSectionSchema.safeParse({ items: [{ headline: "x" }] }).success).toBe(false);
  });

  it("converts to a Gemini-compatible JSON schema", () => {
    const js = toGeminiSchema(LlmSectionSchema);
    expect(JSON.stringify(js)).not.toContain("$schema");
    expect(JSON.stringify(js)).not.toContain("additionalProperties");
    expect(js.type).toBe("object");
  });
});

describe("guards", () => {
  it("flags advice, predictions and hype", () => {
    expect(bannedPhrases("Traders should buy before the listing")).not.toHaveLength(0);
    expect(bannedPhrases("This could be a great opportunity")).not.toHaveLength(0);
    expect(bannedPhrases("BONKX could reach $1 by Friday")).not.toHaveLength(0);
    expect(bannedPhrases("A hidden gem with 100x potential")).not.toHaveLength(0);
    expect(bannedPhrases("Sellers outnumbered buyers; sell pressure rose")).toHaveLength(0);
    expect(bannedPhrases("Liquidity fell 41% in 24h")).toHaveLength(0);
  });

  it("extracts numbers with units", () => {
    const n = extractNumbers("Volume $4.56M, up 312.4% and 3.2x the average; 12 pairs on 2026-10-19 at 12:00 UTC");
    expect(n.map((x) => [x.value, x.unit])).toEqual([
      [4_560_000, "$"],
      [312.4, "%"],
      [3.2, "x"],
      [12, ""],
    ]);
  });

  it("accepts rounded facts, rejects invented numbers", () => {
    const allowed = collectAllowedNumbers({ v: 4_560_000, p: 312.4, sol: 104.69, ch: -0.37 });
    expect(ungroundedNumbers("Volume of $4.6M, +312%, SOL $104.7 (down 0.4%)", allowed)).toEqual([]);
    expect(ungroundedNumbers("Volume of $9.9M", allowed)).toEqual(["$9.9M"]);
    expect(ungroundedNumbers("up 55%", allowed)).toEqual(["55%"]);
    expect(ungroundedNumbers("three of 5 launches", allowed)).toEqual([]); // small counts are fine
  });

  it("auto-tags tokens mentioned by symbol", () => {
    expect(mentionedTokenIds("Watch $BONKX today", new Map([["BONKX", "tok:MINTAAA"]]))).toEqual(["tok:MINTAAA"]);
    expect(mentionedTokenIds("BONKXY is different", new Map([["BONKX", "tok:MINTAAA"]]))).toEqual([]);
  });

  it("checkItem resolves sources (incl. related outlets) and attaches tokens", () => {
    const ctx = checkContext(facts, facts);
    const r = checkItem({ ...verified(), tokenIds: [], factIds: ["tok:MINTAAA", "news:1"] }, ctx);
    expect(r.violations).toEqual([]);
    expect(r.item.tokenIds).toEqual(["tok:MINTAAA"]); // auto-tagged from "BONKX" in text
    expect(r.item.sources.map((s) => s.url)).toEqual(["https://dexscreener.com/solana/pairaaa", "https://solana.com/news/firedancer", "https://theblock.co/firedancer"]);
  });

  it("checkItem reports hallucinated ids and numbers", () => {
    const ctx = checkContext(facts, facts);
    const r = checkItem(verified({ factIds: ["tok:FAKE"], body: "Volume hit $99M and liquidity is $78.9K, up 4.0%." }), ctx);
    expect(r.violations.join(" ")).toMatch(/unknown fact ids/);
    expect(r.violations.join(" ")).toMatch(/numbers not present/);
    expect(r.violations.join(" ")).toMatch(/no resolvable source/);
  });
});

function deps(responses: Array<unknown | Error>): LlmDeps & { calls: number } {
  const d = {
    available: true,
    calls: 0,
    generate: vi.fn(async <T,>(schema: z.ZodType<T>) => {
      const r = responses[Math.min(d.calls, responses.length - 1)];
      d.calls++;
      if (r instanceof Error) throw r;
      const v = schema.safeParse(r);
      if (!v.success) throw new LlmValidationError("schema validation failed", v.error.issues.map((i) => i.message), JSON.stringify(r));
      return { data: v.data, model: "test-model" };
    }),
  };
  return d as unknown as LlmDeps & { calls: number };
}

describe("section generation: validate → retry once → omit", () => {
  it("publishes a valid section on the first try", async () => {
    const d = deps([{ items: [verified()] }]);
    const out = await generateSection("launches", facts, d);
    expect(out.status).toBe("ok");
    expect(out.section?.items[0].sources[0].url).toBe(token.pairUrl);
    expect(d.calls).toBe(1);
  });

  it("retries once after a schema failure, then succeeds", async () => {
    const d = deps([{ items: [{ headline: "bad" }] }, { items: [verified()] }]);
    const out = await generateSection("launches", facts, d);
    expect(out.status).toBe("ok");
    expect(d.calls).toBe(2);
  });

  it("omits the section after two schema failures", async () => {
    const d = deps([{ nope: true }, { items: "nope" }]);
    const out = await generateSection("launches", facts, d);
    expect(out.status).toBe("omitted");
    expect(d.calls).toBe(2);
  });

  it("retries guard violations with feedback, then drops still-bad items", async () => {
    const bad = verified({ headline: "BONKX is a hidden gem", body: "BONKX could reach $1 soon, a real opportunity." });
    const d = deps([{ items: [bad, verified()] }, { items: [bad, verified()] }]);
    const out = await generateSection("launches", facts, d);
    expect(d.calls).toBe(2);
    expect(out.status).toBe("ok");
    expect(out.section?.items).toHaveLength(1);
    const secondPrompt = (d.generate as ReturnType<typeof vi.fn>).mock.calls[1][1].prompt as string;
    expect(secondPrompt).toContain("PREVIOUS ATTEMPT WAS REJECTED");
  });

  it("falls back to facts-only items when the API is unavailable", async () => {
    const d = deps([new LlmUnavailableError("quota")]);
    const out = await generateSection("launches", facts, d);
    expect(out.status).toBe("fallback");
    expect(out.section?.items[0].type).toBe("VERIFIED");
    expect(out.section?.items[0].body).toContain("mint authority enabled");
  });
});

describe("generateBrief", () => {
  it("produces a schema-valid brief and lists omitted sections", async () => {
    const d = deps([{ items: [verified()] }]);
    // make "unusual" fail twice: it has no qualifying facts here, so it is simply empty
    const { brief } = await generateBrief(facts, d);
    expect(BriefSchema.safeParse(brief).success).toBe(true);
    expect(brief.disclaimer).toBe("Not financial advice. Informational only.");
    expect(brief.sections.map((s) => s.id)).toContain("launches");
    expect(brief.mode).toBe("llm");
  });

  it("facts-only mode works with no LLM at all", async () => {
    const { brief } = await generateBrief(facts, { available: false, generate: vi.fn() });
    expect(brief.mode).toBe("facts-only");
    expect(brief.omitted).toContain("why");
    expect(brief.sections.every((s) => s.items.every((i) => i.type === "VERIFIED" && (i.sources.length > 0 || i.factIds.length === 0)))).toBe(true);
  });
});
