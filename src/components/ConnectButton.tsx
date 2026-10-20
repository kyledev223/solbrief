"use client";

import { WalletReadyState, type WalletName } from "@solana/wallet-adapter-base";
import { useWallet } from "@solana/wallet-adapter-react";
import bs58 from "bs58";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { buttonClass } from "./ui";
import { useSession } from "./session";

const INSTALL: Record<string, string> = {
  Phantom: "https://phantom.com/download",
  Solflare: "https://solflare.com/download",
  Backpack: "https://backpack.app/download",
};

const short = (a: string) => `${a.slice(0, 4)}…${a.slice(-4)}`;

export function ConnectButton({ compact = false }: { compact?: boolean }) {
  const { wallets, select, publicKey, connected, connecting, signMessage, disconnect, wallet } = useWallet();
  const { me, refresh } = useSession();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [menu, setMenu] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const wantSignIn = useRef(false);
  const dialogRef = useRef<HTMLDialogElement>(null);

  const signIn = useCallback(async () => {
    if (!publicKey || !signMessage) {
      setError(wallet && !signMessage ? `${wallet.adapter.name} can't sign messages` : "Connect a wallet first");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const address = publicKey.toBase58();
      const n = await fetch("/api/auth/nonce", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ wallet: address }) });
      const nonce = await n.json();
      if (!n.ok) throw new Error(nonce.error ?? "could not start sign-in");
      const sig = await signMessage(new TextEncoder().encode(nonce.message));
      const v = await fetch("/api/auth/verify", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ wallet: address, nonce: nonce.nonce, signature: bs58.encode(sig) }),
      });
      const res = await v.json();
      if (!v.ok) throw new Error(res.error ?? "sign-in failed");
      await refresh();
      router.refresh();
      setOpen(false);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(/reject|denied|cancel/i.test(msg) ? "Signature request was declined." : msg);
    } finally {
      setBusy(false);
      wantSignIn.current = false;
    }
  }, [publicKey, signMessage, wallet, refresh, router]);

  // Once the chosen wallet connects, continue straight into the signature step.
  useEffect(() => {
    if (connected && publicKey && wantSignIn.current && !busy) void signIn();
  }, [connected, publicKey, busy, signIn]);

  useEffect(() => {
    const d = dialogRef.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  const signOut = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    await disconnect().catch(() => undefined);
    await refresh();
    setMenu(false);
    router.refresh();
  };

  const start = () => {
    setError(null);
    wantSignIn.current = true;
    if (connected && publicKey) void signIn();
    else setOpen(true);
  };

  const signedIn = me?.wallet;
  const detected = wallets.filter((w) => w.readyState === WalletReadyState.Installed || w.readyState === WalletReadyState.Loadable);
  const missing = ["Phantom", "Solflare", "Backpack"].filter((n) => !detected.some((w) => w.adapter.name === n));

  if (signedIn) {
    return (
      <div className="relative">
        <button className={buttonClass("ghost")} onClick={() => setMenu((m) => !m)} aria-expanded={menu} aria-haspopup="menu">
          <span className="text-cyan">●</span> {short(signedIn)}
          <span className="rounded border border-violet/50 px-1 text-[10px] text-violet-soft">{me.tier}</span>
        </button>
        {menu && (
          <div role="menu" className="absolute right-0 z-50 mt-1 w-48 overflow-hidden rounded-md border border-line bg-panel text-sm shadow-xl">
            <a role="menuitem" href="/dashboard" className="block px-3 py-2 text-dim hover:bg-panel-2 hover:text-ink">
              &gt;_ dashboard
            </a>
            {me.isAdmin && (
              <a role="menuitem" href="/admin" className="block px-3 py-2 text-dim hover:bg-panel-2 hover:text-ink">
                &gt;_ admin
              </a>
            )}
            <button role="menuitem" onClick={signOut} className="block w-full px-3 py-2 text-left text-dim hover:bg-panel-2 hover:text-risk">
              &gt;_ sign out
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <>
      <button className={buttonClass(compact ? "ghost" : "primary")} onClick={start} disabled={busy || connecting}>
        <span className="text-cyan">&gt;_</span> {busy ? "check wallet…" : connecting ? "connecting…" : connected ? "sign in" : "connect wallet"}
      </button>
      {error && !open && (
        <p role="alert" className="mt-1 max-w-xs text-[11px] text-risk">
          {error}
        </p>
      )}
      <dialog
        ref={dialogRef}
        onClose={() => setOpen(false)}
        className="m-auto w-[min(92vw,420px)] rounded-md border border-line bg-panel p-0 text-ink backdrop:bg-black/70"
      >
        <div className="flex items-center justify-between border-b border-line bg-panel-2 px-4 py-2 text-xs text-dim">
          <span>CONNECT · SIGN-IN WITH SOLANA</span>
          <button onClick={() => setOpen(false)} aria-label="Close" className="text-dim hover:text-ink">
            ✕
          </button>
        </div>
        {open && (
        <div className="space-y-3 p-4">
          <p className="text-xs leading-relaxed text-dim">
            You&apos;ll sign a plain-text message to prove wallet ownership. No transaction, no fees, and we never ask for a seed phrase.
          </p>
          <ul className="space-y-2">
            {detected.map((w) => (
              <li key={w.adapter.name}>
                <button
                  className="flex w-full items-center gap-3 rounded border border-line-2 bg-bg px-3 py-2.5 text-left text-sm hover:border-violet/60"
                  onClick={() => {
                    wantSignIn.current = true;
                    select(w.adapter.name as WalletName);
                  }}
                  disabled={busy || connecting}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element -- wallet-provided data URI icons */}
                  <img src={w.adapter.icon} alt="" width={22} height={22} className="rounded" />
                  <span className="flex-1">{w.adapter.name}</span>
                  <span className="text-[10px] text-cyan">detected</span>
                </button>
              </li>
            ))}
            {missing.map((name) => (
              <li key={name}>
                <a href={INSTALL[name]} target="_blank" rel="noopener noreferrer" className="flex w-full items-center gap-3 rounded border border-dashed border-line-2 px-3 py-2.5 text-sm text-dim hover:text-ink">
                  <span className="flex-1">{name}</span>
                  <span className="text-[10px]">install ↗</span>
                </a>
              </li>
            ))}
          </ul>
          {(busy || connecting) && <p className="text-xs text-cyan">Waiting for your wallet…</p>}
          {error && (
            <p role="alert" className="text-xs text-risk">
              {error}
            </p>
          )}
        </div>
        )}
      </dialog>
    </>
  );
}
