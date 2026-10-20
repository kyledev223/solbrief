import bs58 from "bs58";
import nacl from "tweetnacl";
import { APP_NAME } from "@/config/site";

/**
 * Sign-In With Solana. The server builds (and stores) the exact message; the
 * wallet signs it with signMessage — no transaction, no fees. Verification
 * always uses the server's stored copy, never a message sent by the client.
 */

export interface SiwsFields {
  domain: string;
  address: string;
  uri: string;
  nonce: string;
  issuedAt: string;
  expirationTime: string;
}

export function buildSiwsMessage(f: SiwsFields): string {
  return [
    `${f.domain} wants you to sign in with your Solana account:`,
    f.address,
    "",
    `Sign in to ${APP_NAME}. This only proves you own this wallet. It does not send a transaction, move funds or cost any fees.`,
    "",
    `URI: ${f.uri}`,
    "Version: 1",
    "Chain ID: mainnet",
    `Nonce: ${f.nonce}`,
    `Issued At: ${f.issuedAt}`,
    `Expiration Time: ${f.expirationTime}`,
  ].join("\n");
}

export function parseSiwsMessage(message: string): Partial<SiwsFields> {
  const lines = message.split("\n");
  const field = (name: string) => lines.find((l) => l.startsWith(`${name}: `))?.slice(name.length + 2);
  return {
    domain: lines[0]?.replace(/ wants you to sign in with your Solana account:$/, ""),
    address: lines[1],
    uri: field("URI"),
    nonce: field("Nonce"),
    issuedAt: field("Issued At"),
    expirationTime: field("Expiration Time"),
  };
}

/** A base58 string that decodes to a 32-byte ed25519 public key. */
export function isValidSolanaAddress(address: string): boolean {
  if (typeof address !== "string" || address.length < 32 || address.length > 44) return false;
  try {
    return bs58.decode(address).length === 32;
  } catch {
    return false;
  }
}

function decodeSignature(signature: string): Uint8Array | null {
  try {
    const b58 = bs58.decode(signature);
    if (b58.length === 64) return b58;
  } catch {
    // not base58 — try base64
  }
  try {
    const b64 = Uint8Array.from(Buffer.from(signature, "base64"));
    return b64.length === 64 ? b64 : null;
  } catch {
    return null;
  }
}

export function verifySignature(message: string, signature: string, address: string): boolean {
  if (!isValidSolanaAddress(address)) return false;
  const sig = decodeSignature(signature);
  if (!sig) return false;
  try {
    return nacl.sign.detached.verify(new TextEncoder().encode(message), sig, bs58.decode(address));
  } catch {
    return false;
  }
}

export type SiwsCheck = { ok: true } | { ok: false; reason: string };

/** Full check: signature + the stored message really is for this wallet/domain and unexpired. */
export function verifySiws(args: { message: string; signature: string; address: string; expectedDomain: string; now?: Date }): SiwsCheck {
  const fields = parseSiwsMessage(args.message);
  if (fields.address !== args.address) return { ok: false, reason: "address mismatch" };
  if (fields.domain !== args.expectedDomain) return { ok: false, reason: "domain mismatch" };
  const exp = fields.expirationTime ? Date.parse(fields.expirationTime) : NaN;
  if (!Number.isFinite(exp) || exp <= (args.now ?? new Date()).getTime()) return { ok: false, reason: "message expired" };
  if (!verifySignature(args.message, args.signature, args.address)) return { ok: false, reason: "invalid signature" };
  return { ok: true };
}

export function randomNonce(): string {
  return bs58.encode(nacl.randomBytes(16));
}
