import { z } from "zod";
import { fail, json, limited, parseBody, sameOrigin } from "@/lib/api";
import { setSessionCookie } from "@/lib/auth/session";
import { verifySiws } from "@/lib/auth/siws";
import { refreshBalance } from "@/lib/balance";
import { getStore } from "@/lib/db";

const Body = z.object({
  wallet: z.string().min(32).max(44),
  nonce: z.string().min(8).max(64),
  signature: z.string().min(64).max(200),
});

/** Step 2: verify the signature over the server-stored message, check balance, issue session. */
export async function POST(req: Request) {
  const rl = limited(req, "auth");
  if (rl) return rl;
  if (!sameOrigin(req)) return fail(403, "Cross-origin request rejected");
  const body = await parseBody(req, Body);
  if ("error" in body) return body.error;
  const { wallet, nonce, signature } = body.data;

  const store = getStore();
  const record = await store.consumeNonce(nonce); // single use, even on failure
  if (!record || record.wallet !== wallet) return fail(401, "Sign-in request expired or already used. Try again.");

  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? new URL(req.url).host;
  const check = verifySiws({ message: record.message, signature, address: wallet, expectedDomain: host });
  if (!check.ok) return fail(401, `Signature rejected: ${check.reason}`);

  const user = await refreshBalance(store, wallet, { force: true });
  await store.upsertUser(wallet, { lastLoginAt: new Date().toISOString() });
  await setSessionCookie(wallet);
  return json({ wallet, tier: user.tier, balance: user.balance });
}
