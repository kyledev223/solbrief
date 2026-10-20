import "server-only";
import { LIMITS, type Tier } from "@/config/site";
import type { Store, UserRow } from "./db/store";
import { env } from "./env";
import { RpcClient } from "./fetchers/rpc";
import { tierForBalance } from "./tiers";

const isTier = (t: unknown): t is Tier => t === "FREE" || t === "HOLDER" || t === "WHALE";

/**
 * Server-side balance → tier. Cached on the user row and re-checked when older
 * than LIMITS.balanceRecheckHours. RPC failures keep the last known values
 * rather than downgrading (or upgrading) anyone.
 */
export async function refreshBalance(store: Store, wallet: string, opts: { force?: boolean } = {}): Promise<UserRow> {
  const user = await store.getUser(wallet);
  const fresh = user?.balanceCheckedAt && Date.now() - Date.parse(user.balanceCheckedAt) < LIMITS.balanceRecheckHours * 3_600_000;
  if (user && fresh && !opts.force) return applyDevOverride(user);

  let balance: number | null = null;
  if (!env.tokenMint) balance = 0;
  else {
    try {
      balance = await new RpcClient(env.rpcUrl).tokenBalance(wallet, env.tokenMint);
    } catch (err) {
      console.error(`[balance] RPC failed for ${wallet}:`, err instanceof Error ? err.message : err);
    }
  }

  if (balance == null) {
    return applyDevOverride(user ?? (await store.upsertUser(wallet, {})));
  }
  const updated = await store.upsertUser(wallet, { balance, tier: tierForBalance(balance), balanceCheckedAt: new Date().toISOString() });
  return applyDevOverride(updated);
}

function applyDevOverride(u: UserRow): UserRow {
  return isTier(env.devTierOverride) ? { ...u, tier: env.devTierOverride } : u;
}

/** Cron helper: re-check the stalest balances. */
export async function recheckStaleBalances(store: Store, limit = 100): Promise<{ checked: number; changed: number }> {
  const cutoff = new Date(Date.now() - LIMITS.balanceRecheckHours * 3_600_000).toISOString();
  const users = await store.usersWithStaleBalance(cutoff, limit);
  let changed = 0;
  for (const u of users) {
    const after = await refreshBalance(store, u.wallet, { force: true });
    if (after.tier !== u.tier) changed++;
  }
  return { checked: users.length, changed };
}
