import { describe, it, expect } from "vitest";
import bs58 from "bs58";
import { normalizeSignature } from "@/lib/wallets/okx";

describe("OKX Wallet signature normalization", () => {
  const sig = Uint8Array.from({ length: 64 }, (_, i) => i);

  it("accepts every shape OKX versions have returned", () => {
    expect(normalizeSignature({ signature: sig })).toEqual(sig);
    expect(normalizeSignature(sig)).toEqual(sig);
    expect(normalizeSignature(bs58.encode(sig))).toEqual(sig);
    expect(normalizeSignature({ signature: bs58.encode(sig) })).toEqual(sig);
    expect(normalizeSignature({ signature: Array.from(sig) })).toEqual(sig);
    expect(normalizeSignature({ signature: { type: "Buffer", data: Array.from(sig) } })).toEqual(sig);
  });

  it("rejects garbage instead of sending a bad signature", () => {
    expect(() => normalizeSignature(undefined)).toThrow();
    expect(() => normalizeSignature({ signature: 42 })).toThrow();
  });
});
