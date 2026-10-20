"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import type { Tier } from "@/config/site";

export interface Me {
  wallet: string | null;
  tier: Tier;
  balance?: number;
  balanceCheckedAt?: string | null;
  isAdmin?: boolean;
  next?: { tier: Tier; needed: number } | null;
}

const Ctx = createContext<{ me: Me | null; refresh: () => Promise<void> }>({ me: null, refresh: async () => {} });

/** Client-side view of the server session (the server remains the source of truth). */
export function SessionProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  const refresh = useCallback(async () => {
    try {
      const r = await fetch("/api/me", { cache: "no-store" });
      setMe(r.ok ? await r.json() : { wallet: null, tier: "FREE" });
    } catch {
      setMe({ wallet: null, tier: "FREE" });
    }
  }, []);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial session fetch
    void refresh();
  }, [refresh]);
  return <Ctx.Provider value={{ me, refresh }}>{children}</Ctx.Provider>;
}

export const useSession = () => useContext(Ctx);
