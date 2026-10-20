import type { Brief, BriefSection, ResearchOutput, AskAnswer } from "../brief/schema";
import type { FeedConfig, FetchLog, NewsItem, PairData } from "../fetchers/types";
import type { FactsPack, RunStats, Tier, Topic } from "../types";

export type RunKind = "daily" | "refresh" | "manual";
export type RunStatus = "running" | "success" | "partial" | "failed";

export interface RunRow {
  id: string;
  kind: RunKind;
  status: RunStatus;
  startedAt: string;
  finishedAt: string | null;
  stats: Partial<RunStats>;
  error: string | null;
}

export interface FetchLogRow extends FetchLog {
  id: number;
  runId: string | null;
  createdAt: string;
}

export interface PairSnapshotRow {
  pairAddress: string;
  capturedAt: string;
  volumeH24: number | null;
  liquidityUsd: number | null;
}

export interface UserRow {
  wallet: string;
  balance: number;
  tier: Tier;
  balanceCheckedAt: string | null;
  topics: Topic[];
  telegramChatId: string | null;
  email: string | null;
  deliveryChannel: "telegram" | "email" | null;
  deliveryEnabled: boolean;
  createdAt: string;
  lastLoginAt: string | null;
}

export interface BriefRow {
  id: string;
  briefDate: string;
  status: "published" | "failed";
  publishedAt: string;
  content: Brief;
  facts: FactsPack;
  model: string | null;
  omittedSections: string[];
  runId: string | null;
}

export interface BriefListRow {
  briefDate: string;
  publishedAt: string;
  headline: string;
  omittedSections: string[];
}

export interface NonceRow {
  nonce: string;
  wallet: string;
  message: string;
  expiresAt: string;
}

export interface ResearchRow {
  id: string;
  wallet: string;
  query: string;
  status: "pending" | "complete" | "failed";
  content: (ResearchOutput & { sources: { label: string; url: string }[]; facts?: unknown }) | null;
  error: string | null;
  createdAt: string;
  completedAt: string | null;
}

export interface TokenRiskData {
  mintAuthority: string | null | undefined;
  freezeAuthority: string | null | undefined;
  top10Pct: number | null;
  lpLockedPct: number | null;
  jupiterVerified: boolean | null;
  supply?: string;
  sources: string[];
}

export interface Store {
  readonly kind: "supabase" | "file";

  // pipeline bookkeeping
  createRun(kind: RunKind): Promise<string>;
  finishRun(id: string, status: RunStatus, stats: Partial<RunStats>, error?: string): Promise<void>;
  latestRun(opts?: { kinds?: RunKind[]; finishedOnly?: boolean }): Promise<RunRow | null>;
  recentRuns(limit: number): Promise<RunRow[]>;
  insertFetchLogs(runId: string | null, logs: FetchLog[]): Promise<void>;
  recentFetchLogs(limit: number): Promise<FetchLogRow[]>;
  insertRawSnapshot(runId: string, source: string, payload: unknown): Promise<void>;
  insertPairSnapshots(runId: string, pairs: PairData[]): Promise<void>;
  pairHistory(pairAddresses: string[], sinceIso: string): Promise<PairSnapshotRow[]>;
  getTokenRisk(mints: string[], maxAgeHours: number): Promise<Map<string, TokenRiskData>>;
  upsertTokenRisk(entries: Map<string, TokenRiskData>): Promise<void>;
  prune(olderThanDays: number): Promise<void>;

  // feeds & news
  listFeeds(): Promise<FeedConfig[]>;
  upsertFeed(feed: FeedConfig): Promise<void>;
  deleteFeed(id: string): Promise<void>;
  upsertNews(items: NewsItem[]): Promise<void>;
  recentNews(sinceIso: string, limit: number): Promise<NewsItem[]>;

  // briefs
  upsertBrief(row: Omit<BriefRow, "id">): Promise<void>;
  getBrief(date: string): Promise<BriefRow | null>;
  /** Most recent brief published at or before `publishedBefore` (ISO). */
  latestBrief(publishedBefore?: string): Promise<BriefRow | null>;
  listBriefs(limit: number): Promise<BriefListRow[]>;
  getTopicSection(date: string, key: string): Promise<BriefSection | null>;
  putTopicSection(date: string, key: string, section: BriefSection): Promise<void>;

  // users & auth
  getUser(wallet: string): Promise<UserRow | null>;
  upsertUser(wallet: string, patch: Partial<Omit<UserRow, "wallet" | "createdAt">>): Promise<UserRow>;
  usersWithStaleBalance(olderThanIso: string, limit: number): Promise<UserRow[]>;
  usersWithTopics(minTier: Tier): Promise<UserRow[]>;
  deliveryRecipients(): Promise<UserRow[]>;
  createNonce(row: NonceRow): Promise<void>;
  /** Atomically marks a nonce used. Returns it only if unused and unexpired. */
  consumeNonce(nonce: string): Promise<NonceRow | null>;

  // quotas
  consumeUsage(wallet: string, kind: string, limit: number): Promise<{ allowed: boolean; used: number }>;
  refundUsage(wallet: string, kind: string): Promise<void>;
  getUsage(wallet: string): Promise<Record<string, number>>;

  // research, ask, delivery
  createResearch(wallet: string, query: string): Promise<string>;
  updateResearch(id: string, patch: Partial<Pick<ResearchRow, "status" | "content" | "error" | "completedAt">>): Promise<void>;
  listResearch(wallet: string, limit: number): Promise<ResearchRow[]>;
  getResearch(id: string): Promise<ResearchRow | null>;
  logAsk(wallet: string, briefDate: string | null, question: string, answer: AskAnswer): Promise<void>;
  /** Claims a delivery slot; false if (wallet, date, channel) was already claimed. */
  claimDelivery(wallet: string, briefDate: string, channel: string): Promise<boolean>;
  completeDelivery(wallet: string, briefDate: string, channel: string, ok: boolean, error?: string): Promise<void>;
}

export const utcDay = (d = new Date()) => d.toISOString().slice(0, 10);
