"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { LIMITS } from "@/config/site";
import type { RiskFlag } from "@/lib/types";
import { ConnectButton } from "./ConnectButton";
import { RiskChips } from "./RiskChips";
import { useSession } from "./session";
import { TypeBadge } from "./ui";

interface Answer {
  answer: string;
  type: "VERIFIED" | "SPECULATION" | "INSUFFICIENT_DATA";
  sources: { label: string; url: string }[];
  tokens: { id: string; symbol: string; pairUrl: string; risk: RiskFlag[] }[];
  briefDate: string;
  usage: { used: number; limit: number };
}

type Msg = { role: "user"; text: string } | { role: "bot"; a: Answer } | { role: "error"; text: string };

export function AskChat() {
  const params = useSearchParams();
  const { me } = useSession();
  const [q, setQ] = useState(() => params.get("q")?.slice(0, LIMITS.questionMaxChars) ?? "");
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [busy, setBusy] = useState(false);
  const [usage, setUsage] = useState<{ used: number; limit: number } | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" }), [msgs]);

  const locked = !me?.wallet || me.tier === "FREE";

  const ask = async () => {
    const question = q.trim();
    if (question.length < 3 || busy || locked) return;
    setMsgs((m) => [...m, { role: "user", text: question }]);
    setQ("");
    setBusy(true);
    try {
      const r = await fetch("/api/ask", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ question }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? `HTTP ${r.status}`);
      setUsage(d.usage);
      setMsgs((m) => [...m, { role: "bot", a: d }]);
    } catch (e) {
      setMsgs((m) => [...m, { role: "error", text: e instanceof Error ? e.message : "request failed" }]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="overflow-hidden rounded-md border border-line bg-panel/85">
      <div className="flex items-center justify-between gap-2 border-b border-line bg-panel-2 px-3 py-2 text-[11px] text-dim">
        <span>ASK THE BRIEF · answers only from today&apos;s stored data</span>
        <span>{usage ? `${usage.used}/${usage.limit} today` : me?.tier ? me.tier : ""}</span>
      </div>

      <div className="max-h-[60vh] min-h-[280px] space-y-4 overflow-y-auto p-4" aria-live="polite">
        {msgs.length === 0 && (
          <div className="space-y-2 text-sm text-dim">
            <p>
              <span className="text-violet">❯</span> Ask about today&apos;s launches, unusual volume, risk flags or announcements. Answers cite their sources; anything outside today&apos;s data is declined.
            </p>
            <p className="text-faint">No advice, no price predictions.</p>
          </div>
        )}
        {msgs.map((m, i) =>
          m.role === "user" ? (
            <div key={i} className="text-sm">
              <span className="text-violet">you@brief:~$</span> <span className="text-ink">{m.text}</span>
            </div>
          ) : m.role === "error" ? (
            <div key={i} role="alert" className="text-sm text-risk">
              ! {m.text}
            </div>
          ) : (
            <div key={i} className="space-y-2 rounded border border-line bg-bg/60 p-3">
              <TypeBadge type={m.a.type} />
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-ink">{m.a.answer}</p>
              {m.a.tokens.map((t) => (
                <div key={t.id} className="flex flex-wrap items-center gap-2">
                  <a href={t.pairUrl} target="_blank" rel="noopener noreferrer" className="text-xs font-bold hover:text-cyan">
                    ${t.symbol}
                  </a>
                  <RiskChips flags={t.risk} />
                </div>
              ))}
              {m.a.sources.length > 0 && (
                <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px]">
                  <span className="text-faint">src:</span>
                  {m.a.sources.map((s, k) => (
                    <a key={`${k}-${s.url}`} href={s.url} target="_blank" rel="noopener noreferrer nofollow" className="text-cyan/90 hover:text-cyan">
                      {s.label} ↗
                    </a>
                  ))}
                </div>
              )}
              <div className="text-[10px] text-faint">brief {m.a.briefDate} · not financial advice</div>
            </div>
          ),
        )}
        {busy && <div className="text-sm text-cyan">thinking… (free-tier model, may take a few seconds)</div>}
        <div ref={endRef} />
      </div>

      {locked ? (
        <div className="space-y-3 border-t border-line p-4 text-sm text-dim">
          {!me?.wallet ? <p>Sign in with a wallet holding the HOLDER tier to ask questions.</p> : <p>Ask the Brief requires the HOLDER tier.</p>}
          <div className="flex flex-wrap items-center gap-2">
            {!me?.wallet && <ConnectButton />}
            <Link href="/#token" className="text-xs text-cyan underline underline-offset-2">
              tiers
            </Link>
          </div>
        </div>
      ) : (
        <form
          className="flex items-center gap-2 border-t border-line px-3 py-2.5"
          onSubmit={(e) => {
            e.preventDefault();
            void ask();
          }}
        >
          <label htmlFor="ask-input" className="shrink-0 text-sm text-violet">
            ❯
          </label>
          <input
            id="ask-input"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="ask about today's brief…"
            maxLength={LIMITS.questionMaxChars}
            className="min-w-0 flex-1 bg-transparent text-sm placeholder:text-faint focus:outline-none"
            autoFocus
            disabled={busy}
          />
          <button type="submit" disabled={busy || q.trim().length < 3} className="shrink-0 text-xs text-cyan disabled:opacity-40">
            ⏎ send
          </button>
        </form>
      )}
    </div>
  );
}
