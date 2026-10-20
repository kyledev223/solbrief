import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Brief, BriefSection } from "../brief/schema";
import type { FeedConfig, FetchLog, NewsItem, PairData } from "../fetchers/types";
import type { FactsPack, Tier, Topic } from "../types";
import type { BriefRow, ResearchRow, RunRow, Store, TokenRiskData, UserRow } from "./store";

/* eslint-disable @typescript-eslint/no-explicit-any -- row mapping from untyped PostgREST results */

function check<T>(res: { data: T; error: { message: string } | null }, what: string): T {
  if (res.error) throw new Error(`supabase ${what}: ${res.error.message}`);
  return res.data;
}

const toRun = (r: any): RunRow => ({
  id: r.id,
  kind: r.kind,
  status: r.status,
  startedAt: r.started_at,
  finishedAt: r.finished_at,
  stats: r.stats ?? {},
  error: r.error,
});

const toUser = (r: any): UserRow => ({
  wallet: r.wallet,
  balance: Number(r.balance ?? 0),
  tier: r.tier,
  balanceCheckedAt: r.balance_checked_at,
  topics: (r.topics ?? []) as Topic[],
  telegramChatId: r.telegram_chat_id,
  email: r.email,
  deliveryChannel: r.delivery_channel,
  deliveryEnabled: Boolean(r.delivery_enabled),
  createdAt: r.created_at,
  lastLoginAt: r.last_login_at,
});

const toBrief = (r: any): BriefRow => ({
  id: r.id,
  briefDate: r.brief_date,
  status: r.status,
  publishedAt: r.published_at,
  content: r.content as Brief,
  facts: r.facts as FactsPack,
  model: r.model,
  omittedSections: r.omitted_sections ?? [],
  runId: r.run_id,
});

const toResearch = (r: any): ResearchRow => ({
  id: r.id,
  wallet: r.wallet,
  query: r.query,
  status: r.status,
  content: r.content,
  error: r.error,
  createdAt: r.created_at,
  completedAt: r.completed_at,
});

const toNews = (r: any): NewsItem => ({
  guid: r.guid,
  feedId: r.feed_id,
  sourceName: r.source_name,
  title: r.title,
  link: r.link,
  summary: r.summary ?? "",
  publishedAt: r.published_at,
});

export class SupabaseStore implements Store {
  readonly kind = "supabase" as const;
  private db: SupabaseClient;

  constructor(url: string, serviceKey: string) {
    this.db = createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { fetch: (input, init) => fetch(input, { ...init, cache: "no-store" }) },
    });
  }

  // ── pipeline ───────────────────────────────────────────────
  async createRun(kind: RunRow["kind"]) {
    const data = check(await this.db.from("pipeline_runs").insert({ kind }).select("id").single(), "createRun");
    return (data as any).id as string;
  }
  async finishRun(id: string, status: RunRow["status"], stats: RunRow["stats"], error?: string) {
    check(
      await this.db.from("pipeline_runs").update({ status, stats, error: error ?? null, finished_at: new Date().toISOString() }).eq("id", id),
      "finishRun",
    );
  }
  async latestRun(opts: { kinds?: RunRow["kind"][]; finishedOnly?: boolean } = {}) {
    let q = this.db.from("pipeline_runs").select("*").order("started_at", { ascending: false }).limit(1);
    if (opts.kinds) q = q.in("kind", opts.kinds);
    if (opts.finishedOnly) q = q.in("status", ["success", "partial"]);
    const data = check(await q, "latestRun") as any[];
    return data[0] ? toRun(data[0]) : null;
  }
  async recentRuns(limit: number) {
    const data = check(await this.db.from("pipeline_runs").select("*").order("started_at", { ascending: false }).limit(limit), "recentRuns");
    return (data as any[]).map(toRun);
  }
  async insertFetchLogs(runId: string | null, logs: FetchLog[]) {
    if (!logs.length) return;
    check(
      await this.db.from("fetch_logs").insert(
        logs.map((l) => ({ run_id: runId, source: l.source, ok: l.ok, duration_ms: l.durationMs, attempts: l.attempts, items: l.items, error: l.error ?? null })),
      ),
      "insertFetchLogs",
    );
  }
  async recentFetchLogs(limit: number) {
    const data = check(await this.db.from("fetch_logs").select("*").order("created_at", { ascending: false }).limit(limit), "recentFetchLogs");
    return (data as any[]).map((r) => ({
      id: r.id,
      runId: r.run_id,
      source: r.source,
      ok: r.ok,
      durationMs: r.duration_ms,
      attempts: r.attempts,
      items: r.items,
      error: r.error ?? undefined,
      createdAt: r.created_at,
    }));
  }
  async insertRawSnapshot(runId: string, source: string, payload: unknown) {
    check(await this.db.from("raw_snapshots").insert({ run_id: runId, source, payload }), "insertRawSnapshot");
  }
  async insertPairSnapshots(runId: string, pairs: PairData[]) {
    if (!pairs.length) return;
    const now = new Date().toISOString();
    check(
      await this.db.from("pair_snapshots").insert(
        pairs.map((p) => ({
          run_id: runId,
          captured_at: now,
          pair_address: p.pairAddress,
          token_address: p.tokenAddress,
          symbol: p.symbol,
          name: p.name,
          dex_id: p.dexId,
          price_usd: p.priceUsd,
          volume_h24: p.volumeH24,
          liquidity_usd: p.liquidityUsd,
          fdv: p.fdv,
          market_cap: p.marketCap,
          price_change_h24: p.priceChangeH24,
          pair_created_at: p.pairCreatedAt ? new Date(p.pairCreatedAt).toISOString() : null,
        })),
      ),
      "insertPairSnapshots",
    );
  }
  async pairHistory(pairAddresses: string[], sinceIso: string) {
    if (!pairAddresses.length) return [];
    const out: any[] = [];
    for (let i = 0; i < pairAddresses.length; i += 100) {
      const data = check(
        await this.db
          .from("pair_snapshots")
          .select("pair_address,captured_at,volume_h24,liquidity_usd")
          .in("pair_address", pairAddresses.slice(i, i + 100))
          .gte("captured_at", sinceIso)
          .order("captured_at", { ascending: false })
          .limit(5000),
        "pairHistory",
      );
      out.push(...(data as any[]));
    }
    return out.map((r) => ({ pairAddress: r.pair_address, capturedAt: r.captured_at, volumeH24: r.volume_h24, liquidityUsd: r.liquidity_usd }));
  }
  async getTokenRisk(mints: string[], maxAgeHours: number) {
    const out = new Map<string, TokenRiskData>();
    if (!mints.length) return out;
    const since = new Date(Date.now() - maxAgeHours * 3_600_000).toISOString();
    const data = check(await this.db.from("token_risk").select("*").in("token_address", mints).gte("checked_at", since), "getTokenRisk");
    for (const r of data as any[]) out.set(r.token_address, r.data);
    return out;
  }
  async upsertTokenRisk(entries: Map<string, TokenRiskData>) {
    if (!entries.size) return;
    const now = new Date().toISOString();
    check(
      await this.db.from("token_risk").upsert([...entries].map(([token_address, data]) => ({ token_address, data, checked_at: now }))),
      "upsertTokenRisk",
    );
  }
  async prune(olderThanDays: number) {
    const cutoff = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString();
    await Promise.all([
      this.db.from("raw_snapshots").delete().lt("fetched_at", cutoff(olderThanDays)),
      this.db.from("pair_snapshots").delete().lt("captured_at", cutoff(Math.max(olderThanDays, 10))),
      this.db.from("fetch_logs").delete().lt("created_at", cutoff(30)),
      this.db.from("auth_nonces").delete().lt("expires_at", cutoff(1)),
      this.db.from("news_items").delete().lt("fetched_at", cutoff(60)),
    ]);
  }

  // ── feeds & news ───────────────────────────────────────────
  async listFeeds() {
    const data = check(await this.db.from("rss_feeds").select("*").order("id"), "listFeeds");
    return (data as any[]).map((r) => ({ id: r.id, name: r.name, url: r.url, category: r.category, keywords: r.keywords ?? [], enabled: r.enabled }));
  }
  async upsertFeed(f: FeedConfig) {
    check(
      await this.db.from("rss_feeds").upsert({
        id: f.id,
        name: f.name,
        url: f.url,
        category: f.category,
        keywords: f.keywords ?? [],
        enabled: f.enabled,
        updated_at: new Date().toISOString(),
      }),
      "upsertFeed",
    );
  }
  async deleteFeed(id: string) {
    check(await this.db.from("rss_feeds").delete().eq("id", id), "deleteFeed");
  }
  async upsertNews(items: NewsItem[]) {
    if (!items.length) return;
    check(
      await this.db.from("news_items").upsert(
        items.map((i) => ({
          guid: i.guid,
          feed_id: i.feedId,
          source_name: i.sourceName,
          title: i.title,
          link: i.link,
          summary: i.summary,
          published_at: i.publishedAt,
        })),
        { onConflict: "guid", ignoreDuplicates: true },
      ),
      "upsertNews",
    );
  }
  async recentNews(sinceIso: string, limit: number) {
    const data = check(
      await this.db
        .from("news_items")
        .select("*")
        .or(`published_at.gte.${sinceIso},and(published_at.is.null,fetched_at.gte.${sinceIso})`)
        .order("published_at", { ascending: false, nullsFirst: false })
        .limit(limit),
      "recentNews",
    );
    return (data as any[]).map(toNews);
  }

  // ── briefs ─────────────────────────────────────────────────
  async upsertBrief(row: Omit<BriefRow, "id">) {
    check(
      await this.db.from("briefs").upsert(
        {
          brief_date: row.briefDate,
          status: row.status,
          published_at: row.publishedAt,
          content: row.content,
          facts: row.facts,
          model: row.model,
          omitted_sections: row.omittedSections,
          run_id: row.runId,
        },
        { onConflict: "brief_date" },
      ),
      "upsertBrief",
    );
  }
  async getBrief(date: string) {
    const data = check(await this.db.from("briefs").select("*").eq("brief_date", date).eq("status", "published").maybeSingle(), "getBrief");
    return data ? toBrief(data) : null;
  }
  async latestBrief(publishedBefore?: string) {
    let q = this.db.from("briefs").select("*").eq("status", "published").order("published_at", { ascending: false }).limit(1);
    if (publishedBefore) q = q.lte("published_at", publishedBefore);
    const data = check(await q, "latestBrief") as any[];
    return data[0] ? toBrief(data[0]) : null;
  }
  async listBriefs(limit: number) {
    const data = check(
      await this.db
        .from("briefs")
        .select("brief_date,published_at,omitted_sections,headline:content->>headline")
        .eq("status", "published")
        .order("brief_date", { ascending: false })
        .limit(limit),
      "listBriefs",
    );
    return (data as any[]).map((r) => ({ briefDate: r.brief_date, publishedAt: r.published_at, headline: r.headline ?? "", omittedSections: r.omitted_sections ?? [] }));
  }
  async getTopicSection(date: string, key: string) {
    const data = check(await this.db.from("topic_sections").select("content").eq("brief_date", date).eq("topic_key", key).maybeSingle(), "getTopicSection");
    return data ? ((data as any).content as BriefSection) : null;
  }
  async putTopicSection(date: string, key: string, section: BriefSection) {
    check(await this.db.from("topic_sections").upsert({ brief_date: date, topic_key: key, content: section }), "putTopicSection");
  }

  // ── users & auth ───────────────────────────────────────────
  async getUser(wallet: string) {
    const data = check(await this.db.from("users").select("*").eq("wallet", wallet).maybeSingle(), "getUser");
    return data ? toUser(data) : null;
  }
  async upsertUser(wallet: string, patch: Partial<Omit<UserRow, "wallet" | "createdAt">>) {
    const row: Record<string, unknown> = { wallet };
    if (patch.balance !== undefined) row.balance = patch.balance;
    if (patch.tier !== undefined) row.tier = patch.tier;
    if (patch.balanceCheckedAt !== undefined) row.balance_checked_at = patch.balanceCheckedAt;
    if (patch.topics !== undefined) row.topics = patch.topics;
    if (patch.telegramChatId !== undefined) row.telegram_chat_id = patch.telegramChatId;
    if (patch.email !== undefined) row.email = patch.email;
    if (patch.deliveryChannel !== undefined) row.delivery_channel = patch.deliveryChannel;
    if (patch.deliveryEnabled !== undefined) row.delivery_enabled = patch.deliveryEnabled;
    if (patch.lastLoginAt !== undefined) row.last_login_at = patch.lastLoginAt;
    const data = check(await this.db.from("users").upsert(row, { onConflict: "wallet" }).select("*").single(), "upsertUser");
    return toUser(data);
  }
  async usersWithStaleBalance(olderThanIso: string, limit: number) {
    const data = check(
      await this.db
        .from("users")
        .select("*")
        .or(`balance_checked_at.is.null,balance_checked_at.lt.${olderThanIso}`)
        .order("balance_checked_at", { ascending: true, nullsFirst: true })
        .limit(limit),
      "usersWithStaleBalance",
    );
    return (data as any[]).map(toUser);
  }
  async usersWithTopics(minTier: Tier) {
    const tiers = minTier === "WHALE" ? ["WHALE"] : ["HOLDER", "WHALE"];
    const data = check(await this.db.from("users").select("*").in("tier", tiers).limit(2000), "usersWithTopics");
    return (data as any[]).map(toUser).filter((u) => u.topics.length > 0);
  }
  async deliveryRecipients() {
    const data = check(await this.db.from("users").select("*").eq("tier", "WHALE").eq("delivery_enabled", true).limit(2000), "deliveryRecipients");
    return (data as any[]).map(toUser);
  }
  async createNonce(row: { nonce: string; wallet: string; message: string; expiresAt: string }) {
    check(await this.db.from("auth_nonces").insert({ nonce: row.nonce, wallet: row.wallet, message: row.message, expires_at: row.expiresAt }), "createNonce");
  }
  async consumeNonce(nonce: string) {
    const now = new Date().toISOString();
    const data = check(
      await this.db.from("auth_nonces").update({ used_at: now }).eq("nonce", nonce).is("used_at", null).gt("expires_at", now).select("*").maybeSingle(),
      "consumeNonce",
    );
    return data ? { nonce: (data as any).nonce, wallet: (data as any).wallet, message: (data as any).message, expiresAt: (data as any).expires_at } : null;
  }

  // ── quotas ─────────────────────────────────────────────────
  async consumeUsage(wallet: string, kind: string, limit: number) {
    const data = check(await this.db.rpc("consume_usage", { p_wallet: wallet, p_kind: kind, p_limit: limit }), "consumeUsage") as any[];
    const row = data[0] ?? { allowed: false, used: limit };
    return { allowed: Boolean(row.allowed), used: Number(row.used) };
  }
  async refundUsage(wallet: string, kind: string) {
    check(await this.db.rpc("refund_usage", { p_wallet: wallet, p_kind: kind }), "refundUsage");
  }
  async getUsage(wallet: string) {
    const day = new Date().toISOString().slice(0, 10);
    const data = check(await this.db.from("usage_counters").select("kind,count").eq("wallet", wallet).eq("day", day), "getUsage");
    return Object.fromEntries((data as any[]).map((r) => [r.kind, r.count]));
  }

  // ── research / ask / delivery ──────────────────────────────
  async createResearch(wallet: string, query: string) {
    const data = check(await this.db.from("research_reports").insert({ wallet, query }).select("id").single(), "createResearch");
    return (data as any).id as string;
  }
  async updateResearch(id: string, patch: Partial<Pick<ResearchRow, "status" | "content" | "error" | "completedAt">>) {
    const row: Record<string, unknown> = {};
    if (patch.status) row.status = patch.status;
    if (patch.content !== undefined) row.content = patch.content;
    if (patch.error !== undefined) row.error = patch.error;
    if (patch.completedAt !== undefined) row.completed_at = patch.completedAt;
    check(await this.db.from("research_reports").update(row).eq("id", id), "updateResearch");
  }
  async listResearch(wallet: string, limit: number) {
    const data = check(
      await this.db.from("research_reports").select("*").eq("wallet", wallet).order("created_at", { ascending: false }).limit(limit),
      "listResearch",
    );
    return (data as any[]).map(toResearch);
  }
  async getResearch(id: string) {
    const data = check(await this.db.from("research_reports").select("*").eq("id", id).maybeSingle(), "getResearch");
    return data ? toResearch(data) : null;
  }
  async logAsk(wallet: string, briefDate: string | null, question: string, answer: unknown) {
    check(await this.db.from("ask_log").insert({ wallet, brief_date: briefDate, question, answer }), "logAsk");
  }
  async claimDelivery(wallet: string, briefDate: string, channel: string) {
    const res = await this.db
      .from("delivery_log")
      .upsert({ wallet, brief_date: briefDate, channel, ok: false }, { onConflict: "wallet,brief_date,channel", ignoreDuplicates: true })
      .select("id");
    const data = check(res, "claimDelivery") as any[] | null;
    return Boolean(data && data.length);
  }
  async completeDelivery(wallet: string, briefDate: string, channel: string, ok: boolean, error?: string) {
    check(
      await this.db.from("delivery_log").update({ ok, error: error ?? null }).eq("wallet", wallet).eq("brief_date", briefDate).eq("channel", channel),
      "completeDelivery",
    );
  }
}
