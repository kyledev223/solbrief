import { describe, it, expect } from "vitest";
import bs58 from "bs58";
import nacl from "tweetnacl";
import { buildSiwsMessage, isValidSolanaAddress, parseSiwsMessage, randomNonce, verifySignature, verifySiws } from "@/lib/auth/siws";

function wallet() {
  const kp = nacl.sign.keyPair();
  return { address: bs58.encode(kp.publicKey), sign: (msg: string) => bs58.encode(nacl.sign.detached(new TextEncoder().encode(msg), kp.secretKey)) };
}

function message(address: string, over: Partial<Parameters<typeof buildSiwsMessage>[0]> = {}) {
  const now = new Date();
  return buildSiwsMessage({
    domain: "solbrief.app",
    address,
    uri: "https://solbrief.app",
    nonce: randomNonce(),
    issuedAt: now.toISOString(),
    expirationTime: new Date(now.getTime() + 10 * 60_000).toISOString(),
    ...over,
  });
}

describe("Sign-In With Solana", () => {
  it("builds a standard, parseable message with no transaction", () => {
    const w = wallet();
    const msg = message(w.address);
    expect(msg.split("\n")[0]).toBe("solbrief.app wants you to sign in with your Solana account:");
    expect(msg).toContain("does not send a transaction");
    const f = parseSiwsMessage(msg);
    expect(f.address).toBe(w.address);
    expect(f.domain).toBe("solbrief.app");
    expect(f.nonce).toHaveLength(f.nonce!.length);
  });

  it("accepts a valid signature (base58 and base64)", () => {
    const w = wallet();
    const msg = message(w.address);
    const sig58 = w.sign(msg);
    expect(verifySignature(msg, sig58, w.address)).toBe(true);
    const sig64 = Buffer.from(bs58.decode(sig58)).toString("base64");
    expect(verifySignature(msg, sig64, w.address)).toBe(true);
    expect(verifySiws({ message: msg, signature: sig58, address: w.address, expectedDomain: "solbrief.app" })).toEqual({ ok: true });
  });

  it("rejects a tampered message", () => {
    const w = wallet();
    const msg = message(w.address);
    const sig = w.sign(msg);
    expect(verifySignature(msg.replace("Version: 1", "Version: 2"), sig, w.address)).toBe(false);
  });

  it("rejects a signature from a different wallet", () => {
    const a = wallet();
    const b = wallet();
    const msg = message(a.address);
    expect(verifySiws({ message: msg, signature: b.sign(msg), address: a.address, expectedDomain: "solbrief.app" })).toEqual({ ok: false, reason: "invalid signature" });
  });

  it("rejects domain mismatch (phishing relay)", () => {
    const w = wallet();
    const msg = message(w.address, { domain: "evil.example" });
    expect(verifySiws({ message: msg, signature: w.sign(msg), address: w.address, expectedDomain: "solbrief.app" })).toEqual({ ok: false, reason: "domain mismatch" });
  });

  it("rejects expired messages", () => {
    const w = wallet();
    const msg = message(w.address, { expirationTime: new Date(Date.now() - 1000).toISOString() });
    expect(verifySiws({ message: msg, signature: w.sign(msg), address: w.address, expectedDomain: "solbrief.app" })).toEqual({ ok: false, reason: "message expired" });
  });

  it("rejects a message issued for another address", () => {
    const a = wallet();
    const b = wallet();
    const msg = message(b.address);
    expect(verifySiws({ message: msg, signature: a.sign(msg), address: a.address, expectedDomain: "solbrief.app" }).ok).toBe(false);
  });

  it("rejects malformed inputs without throwing", () => {
    const w = wallet();
    expect(verifySignature("hi", "not-a-signature", w.address)).toBe(false);
    expect(verifySignature("hi", w.sign("hi"), "short")).toBe(false);
    expect(isValidSolanaAddress("0OIl")).toBe(false);
    expect(isValidSolanaAddress(w.address)).toBe(true);
  });

  it("nonces are unique", () => {
    const set = new Set(Array.from({ length: 200 }, randomNonce));
    expect(set.size).toBe(200);
  });
});
