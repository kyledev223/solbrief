import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import feedsJson from "@/config/feeds.json";
import type { BriefSection, AskAnswer } from "../brief/schema";
import type { FeedConfig, FetchLog, NewsItem, PairData } from "../fetchers/types";
import type { RunStats, Tier } from "../types";
import type {
  BriefRow,
  FetchLogRow,
  NonceRow,
  PairSnapshotRow,
  ResearchRow,
  RunRow,
  Store,
  TokenRiskData,
  UserRow,
} from "./store";

/**
 * Local development store: one JSON file per table under ./.data.
 * Single-process only — never used in production.
 */
interface Tables {
  runs: RunRow[];
  fetchLogs: FetchLogRow[];
  raw: Array<{ runId: string; source: string; fetchedAt: string; payload: unknown }>;
  pairs: Array<PairSnapshotRow & { tokenAddress: string }>;
  risk: Record<string, { data: TokenRiskData; checkedAt: string }>;
  feeds: FeedConfig[];
  news: Array<NewsItem & { fetchedAt: string }>;
  briefs: BriefRow[];
  topics: Record<string, BriefSection>;
  users: UserRow[];
  nonces: Array<NonceRow & { usedAt: string | null }>;
  usage: Record<string, number>;
  research: ResearchRow[];
  ask: Array<{ wallet: string; briefDate: string | null; question: string; answer: AskAnswer; createdAt: string }>;
  delivery: Record<string, { ok: boolean; error?: string }>;
}

const DEFAULTS: { [K in keyof Tables]: () => Tables[K] } = {
  runs: () => [],
  fetchLogs: () => [],
  raw: () => [],
  pairs: () => [],
  risk: () => ({}),
  feeds: () => (feedsJson.feeds as FeedConfig[]).map((f) => ({ ...f, keywords: f.keywords ?? [] })),
  news: () => [],
  briefs: () => [],
  topics: () => ({}),
  users: () => [],
  nonces: () => [],
  usage: () => ({}),
  research: () => [],
  ask: () => [],
  delivery: () => ({}),
};

const now = () => new Date().toISOString();
const day = () => now().slice(0, 10);

export class FileStore implements Store {
  readonly kind = "file" as const;
  private lock: Promise<unknown> = Promise.resolve();

  constructor(private dir = path.join(process.cwd(), ".data")) {}

  private async read<K extends keyof Tables>(t: K): Promise<Tables[K]> {
    try {
      return JSON.parse(await fs.readFile(path.join(this.dir, `${t}.json`), "utf8")) as Tables[K];
    } catch {
      return DEFAULTS[t]();
    }
  }

  private async write<K extends keyof Tables>(t: K, value: Tables[K]) {
    await fs.mkdir(this.dir, { recursive: true });
    const file = path.join(this.dir, `${t}.json`);
    await fs.writeFile(`${file}.tmp`, JSON.stringify(value));
    await fs.rename(`${file}.tmp`, file);
  }

  /** Serialized read-modify-write so concurrent requests don't clobber. */
  private mutate<K extends keyof Tables, R>(t: K, fn: (v: Tables[K]) => R | Promise<R>): Promise<R> {
    const run = this.lock.then(async () => {
      const v = await this.read(t);
      const r = await fn(v);
      await this.write(t, v);
      return r;
    });
    this.lock = run.catch(() => undefined);
    return run;
  }

  // ── pipeline ───────────────────────────────────────────────
  async createRun(kind: RunRow["kind"]) {
    const id = randomUUID();
    await this.mutate("runs", (runs) => {
      runs.unshift({ id, kind, status: "running", startedAt: now(), finishedAt: null, stats: {}, error: null });
      runs.splice(200);
    });
    return id;
  }
  async finishRun(id: string, status: RunRow["status"], stats: Partial<RunStats>, error?: string) {
    await this.mutate("runs", (runs) => {
      const r = runs.find((x) => x.id === id);
      if (r) Object.assign(r, { status, stats, error: error ?? null, finishedAt: now() });
    });
  }
  async latestRun(opts: { kinds?: RunRow["kind"][]; finishedOnly?: boolean } = {}) {
    const runs = await this.read("runs");
    return (
      runs.find((r) => (!opts.kinds || opts.kinds.includes(r.kind)) && (!opts.finishedOnly || r.status === "success" || r.status === "partial")) ?? null
    );
  }
  async recentRuns(limit: number) {
    return (await this.read("runs")).slice(0, limit);
  }
  async insertFetchLogs(runId: string | null, logs: FetchLog[]) {
    await this.mutate("fetchLogs", (rows) => {
      for (const l of logs) rows.unshift({ ...l, id: Date.now() + Math.random(), runId, createdAt: now() });
      rows.splice(1000);
    });
  }
  async recentFetchLogs(limit: number) {
    return (await this.read("fetchLogs")).slice(0, limit);
  }
  async insertRawSnapshot(runId: string, source: string, payload: unknown) {
    await this.mutate("raw", (rows) => {
      rows.unshift({ runId, source, fetchedAt: now(), payload });
      rows.splice(60);
    });
  }
  async insertPairSnapshots(_runId: string, pairs: PairData[]) {
    const ts = now();
    await this.mutate("pairs", (rows) => {
      for (const p of pairs) rows.push({ pairAddress: p.pairAddress, tokenAddress: p.tokenAddress, capturedAt: ts, volumeH24: p.volumeH24, liquidityUsd: p.liquidityUsd });
    });
  }
  async pairHistory(pairAddresses: string[], sinceIso: string) {
    const set = new Set(pairAddresses);
    return (await this.read("pairs")).filter((r) => set.has(r.pairAddress) && r.capturedAt >= sinceIso);
  }
  async getTokenRisk(mints: string[], maxAgeHours: number) {
    const risk = await this.read("risk");
    const since = new Date(Date.now() - maxAgeHours * 3_600_000).toISOString();
    const out = new Map<string, TokenRiskData>();
    for (const m of mints) if (risk[m] && risk[m].checkedAt >= since) out.set(m, risk[m].data);
    return out;
  }
  async upsertTokenRisk(entries: Map<string, TokenRiskData>) {
    await this.mutate("risk", (risk) => {
      for (const [m, data] of entries) risk[m] = { data, checkedAt: now() };
    });
  }
  async prune(olderThanDays: number) {
    const cutoff = new Date(Date.now() - Math.max(olderThanDays, 10) * 86_400_000).toISOString();
    await this.mutate("pairs", (rows) => {
      const keep = rows.filter((r) => r.capturedAt >= cutoff);
      rows.splice(0, rows.length, ...keep);
    });
  }

  // ── feeds & news ───────────────────────────────────────────
  async listFeeds() {
    return this.read("feeds");
  }
  async upsertFeed(feed: FeedConfig) {
    await this.mutate("feeds", (feeds) => {
      const i = feeds.findIndex((f) => f.id === feed.id);
      if (i >= 0) feeds[i] = feed;
      else feeds.push(feed);
    });
  }
  async deleteFeed(id: string) {
    await this.mutate("feeds", (feeds) => {
      const i = feeds.findIndex((f) => f.id === id);
      if (i >= 0) feeds.splice(i, 1);
    });
  }
  async upsertNews(items: NewsItem[]) {
    await this.mutate("news", (rows) => {
      const seen = new Set(rows.map((r) => r.guid));
      for (const i of items) if (!seen.has(i.guid)) rows.push({ ...i, fetchedAt: now() });
      rows.sort((a, b) => (b.publishedAt ?? b.fetchedAt).localeCompare(a.publishedAt ?? a.fetchedAt));
      rows.splice(1000);
    });
  }
  async recentNews(sinceIso: string, limit: number) {
    return (await this.read("news")).filter((n) => (n.publishedAt ?? n.fetchedAt) >= sinceIso).slice(0, limit);
  }

  // ── briefs ─────────────────────────────────────────────────
  async upsertBrief(row: Omit<BriefRow, "id">) {
    await this.mutate("briefs", (rows) => {
      const i = rows.findIndex((b) => b.briefDate === row.briefDate);
      const full = { ...row, id: i >= 0 ? rows[i].id : randomUUID() };
      if (i >= 0) rows[i] = full;
      else rows.push(full);
      rows.sort((a, b) => b.briefDate.localeCompare(a.briefDate));
    });
  }
  async getBrief(date: string) {
    return (await this.read("briefs")).find((b) => b.briefDate === date && b.status === "published") ?? null;
  }
  async latestBrief(publishedBefore?: string) {
    const rows = (await this.read("briefs")).filter((b) => b.status === "published" && (!publishedBefore || b.publishedAt <= publishedBefore));
    return rows.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))[0] ?? null;
  }
  async listBriefs(limit: number) {
    return (await this.read("briefs"))
      .filter((b) => b.status === "published")
      .slice(0, limit)
      .map((b) => ({ briefDate: b.briefDate, publishedAt: b.publishedAt, headline: b.content.headline, omittedSections: b.omittedSections }));
  }
  async getTopicSection(date: string, key: string) {
    return (await this.read("topics"))[`${date}|${key}`] ?? null;
  }
  async putTopicSection(date: string, key: string, section: BriefSection) {
    await this.mutate("topics", (t) => {
      t[`${date}|${key}`] = section;
    });
  }

  // ── users & auth ───────────────────────────────────────────
  async getUser(wallet: string) {
    return (await this.read("users")).find((u) => u.wallet === wallet) ?? null;
  }
  async upsertUser(wallet: string, patch: Partial<Omit<UserRow, "wallet" | "createdAt">>) {
    return this.mutate("users", (users) => {
      let u = users.find((x) => x.wallet === wallet);
      if (!u) {
        u = {
          wallet,
          balance: 0,
          tier: "FREE",
          balanceCheckedAt: null,
          topics: [],
          telegramChatId: null,
          email: null,
          deliveryChannel: null,
          deliveryEnabled: false,
          createdAt: now(),
          lastLoginAt: null,
        };
        users.push(u);
      }
      const defined = Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined));
      Object.assign(u, defined);
      return { ...u };
    });
  }
  async usersWithStaleBalance(olderThanIso: string, limit: number) {
    return (await this.read("users")).filter((u) => !u.balanceCheckedAt || u.balanceCheckedAt < olderThanIso).slice(0, limit);
  }
  async usersWithTopics(minTier: Tier) {
    const ok = minTier === "WHALE" ? ["WHALE"] : ["HOLDER", "WHALE"];
    return (await this.read("users")).filter((u) => ok.includes(u.tier) && u.topics.length > 0);
  }
  async deliveryRecipients() {
    return (await this.read("users")).filter((u) => u.tier === "WHALE" && u.deliveryEnabled);
  }
  async createNonce(row: NonceRow) {
    await this.mutate("nonces", (rows) => {
      rows.push({ ...row, usedAt: null });
      const t = now();
      const keep = rows.filter((r) => r.expiresAt > t);
      rows.splice(0, rows.length, ...keep);
    });
  }
  async consumeNonce(nonce: string) {
    return this.mutate("nonces", (rows) => {
      const r = rows.find((x) => x.nonce === nonce);
      if (!r || r.usedAt || r.expiresAt <= now()) return null;
      r.usedAt = now();
      return { nonce: r.nonce, wallet: r.wallet, message: r.message, expiresAt: r.expiresAt };
    });
  }

  // ── quotas ─────────────────────────────────────────────────
  async consumeUsage(wallet: string, kind: string, limit: number) {
    return this.mutate("usage", (u) => {
      const k = `${wallet}|${day()}|${kind}`;
      const cur = u[k] ?? 0;
      if (cur >= limit) return { allowed: false, used: cur };
      u[k] = cur + 1;
      return { allowed: true, used: cur + 1 };
    });
  }
  async refundUsage(wallet: string, kind: string) {
    await this.mutate("usage", (u) => {
      const k = `${wallet}|${day()}|${kind}`;
      u[k] = Math.max(0, (u[k] ?? 0) - 1);
    });
  }
  async getUsage(wallet: string) {
    const u = await this.read("usage");
    const prefix = `${wallet}|${day()}|`;
    return Object.fromEntries(Object.entries(u).filter(([k]) => k.startsWith(prefix)).map(([k, v]) => [k.slice(prefix.length), v]));
  }

  // ── research / ask / delivery ──────────────────────────────
  async createResearch(wallet: string, query: string) {
    const id = randomUUID();
    await this.mutate("research", (rows) => {
      rows.unshift({ id, wallet, query, status: "pending", content: null, error: null, createdAt: now(), completedAt: null });
    });
    return id;
  }
  async updateResearch(id: string, patch: Partial<Pick<ResearchRow, "status" | "content" | "error" | "completedAt">>) {
    await this.mutate("research", (rows) => {
      const r = rows.find((x) => x.id === id);
      if (r) Object.assign(r, patch);
    });
  }
  async listResearch(wallet: string, limit: number) {
    return (await this.read("research")).filter((r) => r.wallet === wallet).slice(0, limit);
  }
  async getResearch(id: string) {
    return (await this.read("research")).find((r) => r.id === id) ?? null;
  }
  async logAsk(wallet: string, briefDate: string | null, question: string, answer: AskAnswer) {
    await this.mutate("ask", (rows) => {
      rows.unshift({ wallet, briefDate, question, answer, createdAt: now() });
      rows.splice(500);
    });
  }
  async claimDelivery(wallet: string, briefDate: string, channel: string) {
    return this.mutate("delivery", (d) => {
      const k = `${wallet}|${briefDate}|${channel}`;
      if (d[k]) return false;
      d[k] = { ok: false };
      return true;
    });
  }
  async completeDelivery(wallet: string, briefDate: string, channel: string, ok: boolean, error?: string) {
    await this.mutate("delivery", (d) => {
      d[`${wallet}|${briefDate}|${channel}`] = { ok, error };
    });
  }
}
