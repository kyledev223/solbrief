import { z } from "zod";
import { LIMITS } from "@/config/site";
import { fail, json, limited, parseBody, sameOrigin } from "@/lib/api";
import { buildSiwsMessage, isValidSolanaAddress, randomNonce } from "@/lib/auth/siws";
import { getStore } from "@/lib/db";

const Body = z.object({ wallet: z.string().min(32).max(44) });

/** Step 1 of Sign-In With Solana: issue a single-use nonce + the exact message to sign. */
export async function POST(req: Request) {
  const rl = limited(req, "auth");
  if (rl) return rl;
  if (!sameOrigin(req)) return fail(403, "Cross-origin request rejected");
  const body = await parseBody(req, Body);
  if ("error" in body) return body.error;
  const { wallet } = body.data;
  if (!isValidSolanaAddress(wallet)) return fail(400, "Invalid wallet address");

  const url = new URL(req.url);
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? url.host;
  const proto = req.headers.get("x-forwarded-proto") ?? url.protocol.replace(":", "");
  const nonce = randomNonce();
  const issuedAt = new Date();
  const expiresAt = new Date(issuedAt.getTime() + LIMITS.nonceTtlMinutes * 60_000);
  const message = buildSiwsMessage({
    domain: host,
    address: wallet,
    uri: `${proto}://${host}`,
    nonce,
    issuedAt: issuedAt.toISOString(),
    expirationTime: expiresAt.toISOString(),
  });

  await getStore().createNonce({ nonce, wallet, message, expiresAt: expiresAt.toISOString() });
  return json({ nonce, message });
}
