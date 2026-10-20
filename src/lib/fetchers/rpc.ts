import { chunk, mapLimit, postJson } from "../http";
import type { AttemptHook } from "./context";
import type { MintInfo } from "./types";

// Minimal JSON-RPC client (Helius free RPC or public mainnet). We avoid
// @solana/web3.js on the server so retries/timeouts stay under our control.

export const TOKEN_PROGRAM = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
export const TOKEN_2022_PROGRAM = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb";

interface RpcResponse<T> {
  result?: T;
  error?: { code: number; message: string };
}

export class RpcClient {
  constructor(
    private url: string,
    private onAttempt?: AttemptHook,
  ) {}

  async call<T>(method: string, params: unknown[]): Promise<T> {
    const res = await postJson<RpcResponse<T>>(
      this.url,
      { jsonrpc: "2.0", id: 1, method, params },
      { timeoutMs: 15_000, retries: 3, onAttempt: this.onAttempt },
    );
    if (res.error) {
      const err = new Error(`RPC ${method}: ${res.error.message}`) as Error & { code?: number };
      err.code = res.error.code;
      throw err;
    }
    return res.result as T;
  }

  /** Mint accounts (authorities, supply, decimals) in batches of 100. */
  async mintInfos(mints: string[]): Promise<Map<string, MintInfo>> {
    const out = new Map<string, MintInfo>();
    for (const batch of chunk(mints, 100)) {
      const r = await this.call<{
        value: Array<{
          owner: string;
          data: { parsed?: { type: string; info: { mintAuthority: string | null; freezeAuthority: string | null; supply: string; decimals: number } } };
        } | null>;
      }>("getMultipleAccounts", [batch, { encoding: "jsonParsed" }]);
      r.value.forEach((acc, i) => {
        const info = acc?.data?.parsed?.type === "mint" ? acc.data.parsed.info : null;
        if (!acc || !info) return;
        out.set(batch[i], {
          mint: batch[i],
          mintAuthority: info.mintAuthority ?? null,
          freezeAuthority: info.freezeAuthority ?? null,
          supply: info.supply,
          decimals: info.decimals,
          program: acc.owner,
        });
      });
    }
    return out;
  }

  /**
   * Share of supply held by the 10 largest token accounts (0–100).
   * Note: pool vaults count as holders, which inflates the number for
   * thinly-held tokens — documented in /docs.
   */
  async top10Pct(mint: string, supply: string): Promise<number | null> {
    const total = Number(supply);
    if (!total) return null;
    const r = await this.call<{ value: Array<{ amount: string }> }>("getTokenLargestAccounts", [mint, { commitment: "confirmed" }]);
    const top = r.value.slice(0, 10).reduce((s, a) => s + Number(a.amount), 0);
    return Math.min(100, (top / total) * 100);
  }

  async top10PctMany(mints: Array<{ mint: string; supply: string }>): Promise<Map<string, number>> {
    const out = new Map<string, number>();
    await mapLimit(mints, 3, async ({ mint, supply }) => {
      try {
        const pct = await this.top10Pct(mint, supply);
        if (pct != null) out.set(mint, pct);
      } catch {
        // public RPC rate-limits this method heavily; leave unknown
      }
    });
    return out;
  }

  /** UI-amount balance of `mint` held by `owner`, across all token accounts. */
  async tokenBalance(owner: string, mint: string): Promise<number> {
    const r = await this.call<{
      value: Array<{ account: { data: { parsed: { info: { tokenAmount: { uiAmountString: string } } } } } }>;
    }>("getTokenAccountsByOwner", [owner, { mint }, { encoding: "jsonParsed", commitment: "confirmed" }]);
    return r.value.reduce((s, a) => s + Number(a.account.data.parsed.info.tokenAmount.uiAmountString || 0), 0);
  }

  /** All non-zero token holdings of a wallet (both token programs). */
  async walletTokens(owner: string): Promise<Array<{ mint: string; amount: number }>> {
    const results = await Promise.all(
      [TOKEN_PROGRAM, TOKEN_2022_PROGRAM].map((programId) =>
        this.call<{
          value: Array<{ account: { data: { parsed: { info: { mint: string; tokenAmount: { uiAmountString: string } } } } } }>;
        }>("getTokenAccountsByOwner", [owner, { programId }, { encoding: "jsonParsed", commitment: "confirmed" }]),
      ),
    );
    const byMint = new Map<string, number>();
    for (const r of results)
      for (const a of r.value) {
        const { mint, tokenAmount } = a.account.data.parsed.info;
        const amt = Number(tokenAmount.uiAmountString || 0);
        if (amt > 0) byMint.set(mint, (byMint.get(mint) ?? 0) + amt);
      }
    return [...byMint.entries()].map(([mint, amount]) => ({ mint, amount }));
  }
}
