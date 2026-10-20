import "server-only";
import type { Tier } from "@/config/site";
import { sessionWallet } from "./auth/session";
import { refreshBalance } from "./balance";
import { tryGetStore } from "./db";
import type { UserRow } from "./db/store";
import { env } from "./env";

export interface Viewer {
  wallet: string | null;
  tier: Tier;
  balance: number;
  balanceCheckedAt: string | null;
  isAdmin: boolean;
  user: UserRow | null;
}

export const ANON: Viewer = { wallet: null, tier: "FREE", balance: 0, balanceCheckedAt: null, isAdmin: false, user: null };

/**
 * Who is asking, resolved entirely on the server: session cookie → wallet →
 * cached balance (re-checked via RPC when stale) → tier. The client never
 * supplies its tier.
 */
export async function getViewer(): Promise<Viewer> {
  const wallet = await sessionWallet();
  if (!wallet) return ANON;
  const store = tryGetStore();
  if (!store) return { ...ANON, wallet, isAdmin: env.adminWallets.includes(wallet) };
  try {
    const user = await refreshBalance(store, wallet);
    return {
      wallet,
      tier: user.tier,
      balance: user.balance,
      balanceCheckedAt: user.balanceCheckedAt,
      isAdmin: env.adminWallets.includes(wallet),
      user,
    };
  } catch (err) {
    console.error("[viewer] lookup failed", err);
    return { ...ANON, wallet, isAdmin: env.adminWallets.includes(wallet) };
  }
}
