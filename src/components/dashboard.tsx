"use client";

import { useCallback, useEffect, useState } from "react";
import { LIMITS, TOPIC_PRESETS } from "@/config/site";
import type { ResearchReport } from "@/lib/brief/schema";
import type { Topic } from "@/lib/types";
import { ItemCard, type MentionToken } from "./BriefView";
import { RiskChips } from "./RiskChips";
import { buttonClass } from "./ui";

async function send(url: string, method: string, body?: unknown) {
  const r = await fetch(url, { method, headers: { "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.issues?.join("; ") || d.error || `HTTP ${r.status}`);
  return d;
}

const label = (t: Topic) => (t.kind === "preset" ? (TOPIC_PRESETS.find((p) => p.key === t.key)?.label ?? t.key) : t.kind === "wallet" ? `wallet ${t.value.slice(0, 4)}…${t.value.slice(-4)}` : t.value);
const same = (a: Topic, b: Topic) => a.kind === b.kind && (a.kind === "preset" ? a.key === (b as typeof a).key : a.value === (b as { value: string }).value);

export function TopicsEditor({ initial, enabled }: { initial: Topic[]; enabled: boolean }) {
  const [topics, setTopics] = useState<Topic[]>(initial);
  const [custom, setCustom] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const full = topics.length >= LIMITS.maxTopics;

  const toggle = (t: Topic) => setTopics((cur) => (cur.some((x) => same(x, t)) ? cur.filter((x) => !same(x, t)) : cur.length >= LIMITS.maxTopics ? cur : [...cur, t]));
  const addCustom = () => {
    const v = custom.trim();
    if (!v) return;
    const t: Topic = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(v) ? { kind: "wallet", value: v } : { kind: "project", value: v };
    toggle(t);
    setCustom("");
  };
  const save = async () => {
    setStatus("saving…");
    try {
      const d = await send("/api/topics", "PUT", { topics });
      setTopics(d.topics);
      setStatus("✓ saved — your next brief view includes these sections");
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "save failed");
    }
  };

  return (
    <div className={enabled ? "" : "pointer-events-none opacity-50"} aria-disabled={!enabled}>
      <div className="flex flex-wrap gap-2">
        {TOPIC_PRESETS.map((p) => {
          const t: Topic = { kind: "preset", key: p.key };
          const on = topics.some((x) => same(x, t));
          return (
            <button
              key={p.key}
              type="button"
              onClick={() => toggle(t)}
              aria-pressed={on}
              disabled={!on && full}
              className={`rounded border px-2.5 py-1 text-xs transition-colors disabled:opacity-40 ${on ? "border-violet/70 bg-violet/20 text-ink" : "border-line-2 text-dim hover:text-ink"}`}
            >
              {on ? "✓ " : "+ "}
              {p.label}
            </button>
          );
        })}
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {topics
          .filter((t) => t.kind !== "preset")
          .map((t) => (
            <button key={label(t)} type="button" onClick={() => toggle(t)} className="rounded border border-cyan/50 bg-cyan/10 px-2.5 py-1 text-xs text-ink">
              ✕ {label(t)}
            </button>
          ))}
      </div>
      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        <input
          value={custom}
          onChange={(e) => setCustom(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addCustom())}
          placeholder="project name (e.g. Jupiter) or wallet address to watch"
          className="min-w-0 flex-1 rounded border border-line-2 bg-bg px-3 py-2 text-sm placeholder:text-faint focus:border-violet/60 focus:outline-none"
          maxLength={44}
          disabled={full}
        />
        <button type="button" onClick={addCustom} className={buttonClass("ghost")} disabled={full}>
          + add
        </button>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button type="button" onClick={save} className={buttonClass("primary")}>
          &gt;_ save topics ({topics.length}/{LIMITS.maxTopics})
        </button>
        {status && <span className="text-xs text-dim" role="status">{status}</span>}
      </div>
    </div>
  );
}

export function DeliveryForm({ initial, enabled }: { initial: { channel: "telegram" | "email" | null; enabled: boolean; telegramChatId: string | null; email: string | null }; enabled: boolean }) {
  const [s, setS] = useState(initial);
  const [status, setStatus] = useState<string | null>(null);
  const save = async (on: boolean) => {
    setStatus("saving…");
    try {
      const d = await send("/api/delivery", "PUT", { ...s, enabled: on, channel: s.channel ?? "telegram" });
      setS(d);
      setStatus(on ? "✓ delivery on — digest arrives after each 12:00 UTC brief" : "✓ delivery off");
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "save failed");
    }
  };
  const test = async () => {
    setStatus("sending test…");
    try {
      await send("/api/delivery/test", "POST");
      setStatus("✓ test digest sent");
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "test failed");
    }
  };
  const ch = s.channel ?? "telegram";
  return (
    <div className={`space-y-3 ${enabled ? "" : "pointer-events-none opacity-50"}`} aria-disabled={!enabled}>
      <div className="flex gap-2" role="radiogroup" aria-label="Delivery channel">
        {(["telegram", "email"] as const).map((c) => (
          <button key={c} type="button" role="radio" aria-checked={ch === c} onClick={() => setS({ ...s, channel: c })} className={`rounded border px-3 py-1.5 text-xs ${ch === c ? "border-violet/70 bg-violet/20 text-ink" : "border-line-2 text-dim"}`}>
            {c}
          </button>
        ))}
      </div>
      {ch === "telegram" ? (
        <div className="space-y-1">
          <input
            value={s.telegramChatId ?? ""}
            onChange={(e) => setS({ ...s, telegramChatId: e.target.value })}
            placeholder="numeric Telegram chat id"
            inputMode="numeric"
            className="w-full rounded border border-line-2 bg-bg px-3 py-2 text-sm placeholder:text-faint focus:border-violet/60 focus:outline-none"
          />
          <p className="text-[11px] text-faint">Send /start to our bot first, then get your numeric id from @userinfobot.</p>
        </div>
      ) : (
        <input
          type="email"
          value={s.email ?? ""}
          onChange={(e) => setS({ ...s, email: e.target.value })}
          placeholder="you@example.com"
          className="w-full rounded border border-line-2 bg-bg px-3 py-2 text-sm placeholder:text-faint focus:border-violet/60 focus:outline-none"
        />
      )}
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => save(true)} className={buttonClass("primary")}>
          &gt;_ {s.enabled ? "update" : "enable"} delivery
        </button>
        {s.enabled && (
          <>
            <button type="button" onClick={test} className={buttonClass("ghost")}>
              &gt;_ send test
            </button>
            <button type="button" onClick={() => save(false)} className={buttonClass("ghost")}>
              &gt;_ turn off
            </button>
          </>
        )}
        {status && <span className="text-xs text-dim" role="status">{status}</span>}
      </div>
    </div>
  );
}

interface ReportRow {
  id: string;
  query: string;
  status: "pending" | "complete" | "failed";
  createdAt: string;
  title: string | null;
  error: string | null;
}

export function ResearchPanel({ enabled, limit }: { enabled: boolean; limit: number }) {
  const [rows, setRows] = useState<ReportRow[]>([]);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [open, setOpen] = useState<{ id: string; report: ResearchReport } | null>(null);

  const load = useCallback(async () => {
    if (!enabled) return;
    try {
      const d = await send("/api/research", "GET");
      setRows(d.reports);
    } catch {
      // ignore
    }
  }, [enabled]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial fetch
    void load();
  }, [load]);

  useEffect(() => {
    if (!rows.some((r) => r.status === "pending")) return;
    const id = setInterval(load, 5000);
    return () => clearInterval(id);
  }, [rows, load]);

  const submit = async () => {
    const q = query.trim();
    if (q.length < 2) return;
    setStatus("queued…");
    try {
      const d = await send("/api/research", "POST", { query: q });
      setStatus(`✓ researching — usually 30–90s (${d.usage.used}/${d.usage.limit} today)`);
      setQuery("");
      await load();
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "failed");
    }
  };

  const view = async (id: string) => {
    const d = await send(`/api/research/${id}`, "GET");
    if (d.content) setOpen({ id, report: d.content });
  };

  return (
    <div className={enabled ? "" : "pointer-events-none opacity-50"} aria-disabled={!enabled}>
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), void submit())}
          placeholder="project, ticker or mint address"
          maxLength={LIMITS.researchQueryMaxChars}
          className="min-w-0 flex-1 rounded border border-line-2 bg-bg px-3 py-2 text-sm placeholder:text-faint focus:border-violet/60 focus:outline-none"
        />
        <button type="button" onClick={submit} className={buttonClass("primary")}>
          &gt;_ deep research
        </button>
      </div>
      <p className="mt-1 text-[11px] text-faint">{limit} reports/day · DexScreener, Jupiter, CoinGecko, on-chain risk, GeckoTerminal and recent news</p>
      {status && <p className="mt-2 text-xs text-dim" role="status">{status}</p>}
      <ul className="mt-4 divide-y divide-line rounded border border-line">
        {rows.length === 0 && <li className="px-3 py-3 text-sm text-faint">No reports yet.</li>}
        {rows.map((r) => (
          <li key={r.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2.5 text-sm">
            <span className="min-w-0 flex-1 truncate">{r.title ?? r.query}</span>
            <span className="text-[11px] text-faint">{r.createdAt.slice(0, 16).replace("T", " ")}</span>
            {r.status === "complete" ? (
              <button type="button" onClick={() => view(r.id)} className="text-xs text-cyan hover:text-ink">
                &gt;_ open
              </button>
            ) : r.status === "pending" ? (
              <span className="text-xs text-warn">running…</span>
            ) : (
              <span className="text-xs text-risk" title={r.error ?? ""}>
                failed (not counted)
              </span>
            )}
          </li>
        ))}
      </ul>
      {open && <ReportView report={open.report} onClose={() => setOpen(null)} />}
    </div>
  );
}

function ReportView({ report, onClose }: { report: ResearchReport; onClose: () => void }) {
  const tokens = new Map<string, MentionToken>(report.tokens.map((t) => [t.id, t]));
  return (
    <div className="mt-5 space-y-5 rounded-md border border-violet/40 bg-bg/70 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-xl font-extrabold tracking-tight">{report.title}</h3>
          <p className="mt-1 text-[11px] text-faint">
            {report.generatedAt.slice(0, 16).replace("T", " ")} UTC · {report.model}
          </p>
        </div>
        <button onClick={onClose} className="text-xs text-dim hover:text-ink">
          ✕ close
        </button>
      </div>
      {report.tokens.map((t) => (
        <div key={t.id} className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-bold">${t.symbol}</span>
          <RiskChips flags={t.risk} />
        </div>
      ))}
      <p className="text-sm leading-relaxed text-dim">
        <span className="mr-2 rounded border border-violet/50 px-1 text-[10px] text-violet-soft">~ SUMMARY · ANALYSIS</span>
        {report.summary}
      </p>
      {report.sections.map((s) => (
        <section key={s.heading}>
          <h4 className="mb-2 text-sm font-bold uppercase tracking-wider text-cyan">{s.heading}</h4>
          <ul className="grid gap-2">
            {s.items.map((i, k) => (
              <ItemCard key={k} item={i} tokens={tokens} />
            ))}
          </ul>
        </section>
      ))}
      {report.openQuestions.length > 0 && (
        <section>
          <h4 className="mb-2 text-sm font-bold uppercase tracking-wider text-cyan">Open questions</h4>
          <ul className="list-inside list-disc text-sm text-dim">
            {report.openQuestions.map((q) => (
              <li key={q}>{q}</li>
            ))}
          </ul>
        </section>
      )}
      <p className="text-[11px] text-faint">Not financial advice. Informational only.</p>
    </div>
  );
}
