import { describe, it, expect, vi, afterEach } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { clusterNews, matchesKeywords, parseFeed, titleSimilarity } from "@/lib/fetchers/rss";
import { FetchContext } from "@/lib/fetchers/context";
import { FileStore } from "@/lib/db/file-store";
import { retryDelayMs } from "@/lib/llm/gemini";
import { asciiLogo, pixelMatrix } from "@/lib/ascii";
import { normalizePair, dedupeByToken } from "@/lib/fetchers/dexscreener";

const RSS = `<?xml version="1.0"?><rss version="2.0"><channel><title>x</title>
<item><title>Firedancer hits &amp; passes milestone</title><link>https://example.com/a</link><guid>a1</guid>
<description><![CDATA[<p>Solana validator <b>client</b> news</p>]]></description><pubDate>Mon, 19 Oct 2026 08:00:00 GMT</pubDate></item>
<item><title>Bitcoin ETF flows</title><link>https://example.com/b</link><pubDate>Mon, 19 Oct 2026 07:00:00 GMT</pubDate></item>
<item><title>No link item</title></item>
</channel></rss>`;

const ATOM = `<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom"><title>t</title>
<entry><title>Jupiter launches feature</title><link rel="alternate" href="https://example.com/j"/><id>urn:j</id><updated>2026-10-19T09:00:00Z</updated><summary>Solana DEX aggregator</summary></entry>
</feed>`;

describe("RSS / Atom parsing", () => {
  it("parses RSS 2.0, strips HTML, drops items without links", () => {
    const items = parseFeed(RSS, { id: "f", name: "Feed" });
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({ title: "Firedancer hits & passes milestone", link: "https://example.com/a", summary: "Solana validator client news", guid: "f:a1" });
    expect(items[0].publishedAt).toBe("2026-10-19T08:00:00.000Z");
  });

  it("parses Atom", () => {
    const [i] = parseFeed(ATOM, { id: "atom", name: "Atom" });
    expect(i).toMatchObject({ title: "Jupiter launches feature", link: "https://example.com/j", publishedAt: "2026-10-19T09:00:00.000Z" });
  });

  it("keyword filter keeps only matching stories", () => {
    const items = parseFeed(RSS, { id: "f", name: "Feed" });
    expect(items.filter((i) => matchesKeywords(i, ["solana"])).map((i) => i.link)).toEqual(["https://example.com/a"]);
    expect(items.filter((i) => matchesKeywords(i, [])).length).toBe(2);
  });

  it("clusters the same story from different outlets", () => {
    const a = { title: "Solana treasury firm SkyAI sells all SOL holdings, launches $201M buyback" };
    const b = { title: "SkyAI sells off entire Solana treasury as it launches $201 million buyback" };
    const c = { title: "Pump.fun adds pre-IPO tokens to its launch pairings" };
    expect(titleSimilarity(a.title, b.title)).toBeGreaterThan(0.35);
    const clusters = clusterNews([a, b, c]);
    expect(clusters).toHaveLength(2);
    expect(clusters[0].related).toEqual([b]);
  });
});

describe("FetchContext isolation", () => {
  it("logs failures without throwing and counts attempts", async () => {
    const ctx = new FetchContext();
    const ok = await ctx.run("good", async () => [1, 2, 3]);
    const bad = await ctx.run("bad", async (onAttempt) => {
      onAttempt(1, new Error("x"));
      onAttempt(2, new Error("x"));
      throw new Error("boom");
    });
    expect(ok).toEqual([1, 2, 3]);
    expect(bad).toBeNull();
    expect(ctx.logs).toMatchObject([
      { source: "good", ok: true, items: 3, attempts: 1 },
      { source: "bad", ok: false, error: "boom", attempts: 2 },
    ]);
    expect(ctx.failedSources).toEqual(["bad"]);
  });
});

describe("DexScreener normalization", () => {
  it("normalizes and keeps the deepest pair per token", () => {
    const raw = (pair: string, liq: number) => ({
      chainId: "solana",
      dexId: "raydium",
      url: `https://dexscreener.com/solana/${pair}`,
      pairAddress: pair,
      baseToken: { address: "MINT", name: "Token", symbol: "TKN" },
      quoteToken: { address: "SOL", symbol: "SOL" },
      priceUsd: "0.5",
      liquidity: { usd: liq },
      volume: { h24: 10 },
    });
    const pairs = [normalizePair(raw("A", 100)), normalizePair(raw("B", 900))];
    expect(pairs[0].priceUsd).toBe(0.5);
    expect(dedupeByToken(pairs).map((p) => p.pairAddress)).toEqual(["B"]);
  });
});

describe("file store (dev) semantics match the SQL", () => {
  let dir: string;
  afterEach(async () => {
    if (dir) await fs.rm(dir, { recursive: true, force: true });
  });

  it("nonces are single-use and expire", async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "sb-"));
    const s = new FileStore(dir);
    await s.createNonce({ nonce: "n1", wallet: "w", message: "m", expiresAt: new Date(Date.now() + 60_000).toISOString() });
    await s.createNonce({ nonce: "n2", wallet: "w", message: "m", expiresAt: new Date(Date.now() - 1).toISOString() });
    expect(await s.consumeNonce("n1")).toMatchObject({ wallet: "w" });
    expect(await s.consumeNonce("n1")).toBeNull();
    expect(await s.consumeNonce("n2")).toBeNull();
  });

  it("quotas stop at the limit, even under concurrency, and refund", async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "sb-"));
    const s = new FileStore(dir);
    const results = await Promise.all(Array.from({ length: 6 }, () => s.consumeUsage("w", "ask", 4)));
    expect(results.filter((r) => r.allowed)).toHaveLength(4);
    await s.refundUsage("w", "ask");
    expect((await s.consumeUsage("w", "ask", 4)).allowed).toBe(true);
    expect(await s.getUsage("w")).toEqual({ ask: 4 });
  });

  it("deliveries are claimed once", async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "sb-"));
    const s = new FileStore(dir);
    expect(await s.claimDelivery("w", "2026-10-19", "telegram")).toBe(true);
    expect(await s.claimDelivery("w", "2026-10-19", "telegram")).toBe(false);
  });
});

describe("Gemini helpers", () => {
  it("reads the server-suggested retry delay", () => {
    const err = new Error('{"error":{"code":429,"details":[{"@type":"type.googleapis.com/google.rpc.RetryInfo","retryDelay":"23s"}]}}');
    expect(retryDelayMs(err)).toBe(23_000);
    expect(retryDelayMs(new Error("nope"))).toBeNull();
  });
});

describe("cron auth", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("accepts Bearer or x-cron-secret, rejects everything else", async () => {
    vi.stubEnv("CRON_SECRET", "s3cret-value-that-is-long-enough");
    vi.resetModules();
    const { isCronAuthorized } = await import("@/lib/api");
    const req = (h: Record<string, string>) => new Request("http://x/api/cron/daily", { headers: h });
    expect(isCronAuthorized(req({ authorization: "Bearer s3cret-value-that-is-long-enough" }))).toBe(true);
    expect(isCronAuthorized(req({ "x-cron-secret": "s3cret-value-that-is-long-enough" }))).toBe(true);
    expect(isCronAuthorized(req({ authorization: "Bearer wrong" }))).toBe(false);
    expect(isCronAuthorized(req({}))).toBe(false);
  });

  it("is closed when CRON_SECRET is unset", async () => {
    vi.stubEnv("CRON_SECRET", "");
    vi.resetModules();
    const { isCronAuthorized } = await import("@/lib/api");
    expect(isCronAuthorized(new Request("http://x", { headers: { authorization: "Bearer " } }))).toBe(false);
  });
});

describe("brand mark", () => {
  it("is generated from the name, so renaming redraws it", () => {
    const a = asciiLogo("SOLBRIEF");
    expect(a.split("\n")).toHaveLength(8); // 7 rows + shadow
    expect(asciiLogo("NEWNAME")).not.toEqual(a);
    expect(pixelMatrix("A")[0]).toEqual([false, true, true, true, false]);
  });
});
