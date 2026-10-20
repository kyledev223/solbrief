import { LIMITS } from "@/config/site";
import { json, limited } from "@/lib/api";
import { tryGetStore } from "@/lib/db";
import { dailyLimit, nextTier } from "@/lib/tiers";
import { getViewer } from "@/lib/viewer";

export async function GET(req: Request) {
  const rl = limited(req, "default");
  if (rl) return rl;
  const v = await getViewer();
  if (!v.wallet) return json({ wallet: null, tier: "FREE" });
  const usage = (await tryGetStore()?.getUsage(v.wallet).catch(() => ({}))) ?? {};
  return json({
    wallet: v.wallet,
    tier: v.tier,
    balance: v.balance,
    balanceCheckedAt: v.balanceCheckedAt,
    isAdmin: v.isAdmin,
    next: nextTier(v.tier, v.balance),
    topics: v.user?.topics ?? [],
    maxTopics: LIMITS.maxTopics,
    usage: {
      ask: { used: (usage as Record<string, number>).ask ?? 0, limit: dailyLimit(v.tier, "ask") },
      research: { used: (usage as Record<string, number>).research ?? 0, limit: dailyLimit(v.tier, "research") },
    },
    delivery: {
      channel: v.user?.deliveryChannel ?? null,
      enabled: v.user?.deliveryEnabled ?? false,
      telegramChatId: v.user?.telegramChatId ?? null,
      email: v.user?.email ?? null,
    },
  });
}
