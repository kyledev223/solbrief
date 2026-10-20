"use client";

import { useCallback, useEffect, useState } from "react";
import type { FeedConfig } from "@/lib/fetchers/types";
import { buttonClass, Panel } from "./ui";

interface Run {
  id: string;
  kind: string;
  status: string;
  startedAt: string;
  finishedAt: string | null;
  error: string | null;
  stats: Record<string, unknown>;
}
interface Log {
  id: number;
  source: string;
  ok: boolean;
  durationMs: number;
  attempts: number;
  items: number;
  error?: string;
  createdAt: string;
}

const EMPTY_FEED: FeedConfig = { id: "", name: "", url: "", category: "news", keywords: [], enabled: true };

async function call(url: string, method = "GET", body?: unknown) {
  const r = await fetch(url, { method, headers: { "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.issues?.join("; ") || d.error || `HTTP ${r.status}`);
  return d;
}

export function AdminPanel() {
  const [runs, setRuns] = useState<Run[]>([]);
  const [logs, setLogs] = useState<Log[]>([]);
  const [feeds, setFeeds] = useState<FeedConfig[]>([]);
  const [edit, setEdit] = useState<FeedConfig>(EMPTY_FEED);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [l, f] = await Promise.all([call("/api/admin/logs"), call("/api/admin/feeds")]);
      setRuns(l.runs);
      setLogs(l.logs);
      setFeeds(f.feeds);
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "load failed");
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial fetch
    void load();
  }, [load]);

  const trigger = async (kind: "manual" | "refresh") => {
    setBusy(true);
    setStatus(`running ${kind}… (up to a few minutes)`);
    try {
      const d = await call("/api/admin/trigger", "POST", { kind });
      setStatus(`✓ ${kind} run ${d.status} · ${JSON.stringify(d.stats)}`);
      await load();
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "trigger failed");
    } finally {
      setBusy(false);
    }
  };

  const saveFeed = async () => {
    try {
      const d = await call("/api/admin/feeds", "PUT", edit);
      setFeeds(d.feeds);
      setEdit(EMPTY_FEED);
      setStatus("✓ feed saved");
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "save failed");
    }
  };
  const removeFeed = async (id: string) => {
    if (!confirm(`Delete feed "${id}"?`)) return;
    try {
      const d = await call(`/api/admin/feeds?id=${encodeURIComponent(id)}`, "DELETE");
      setFeeds(d.feeds);
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "delete failed");
    }
  };
  const toggleFeed = async (f: FeedConfig) => {
    try {
      const d = await call("/api/admin/feeds", "PUT", { ...f, enabled: !f.enabled });
      setFeeds(d.feeds);
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "update failed");
    }
  };

  const input = "w-full min-w-0 rounded border border-line-2 bg-bg px-2.5 py-1.5 text-sm placeholder:text-faint focus:border-violet/60 focus:outline-none";

  return (
    <div className="space-y-6">
      <Panel label="pipeline">
        <div className="flex flex-wrap gap-2">
          <button className={buttonClass("primary")} disabled={busy} onClick={() => trigger("manual")}>
            &gt;_ generate brief now
          </button>
          <button className={buttonClass("ghost")} disabled={busy} onClick={() => trigger("refresh")}>
            &gt;_ refresh data only
          </button>
          <button className={buttonClass("ghost")} onClick={load}>
            &gt;_ reload logs
          </button>
        </div>
        {status && (
          <p className="mt-3 break-words text-xs text-dim" role="status">
            {status}
          </p>
        )}
      </Panel>

      <Panel label="recent runs" bodyClassName="overflow-x-auto p-0">
        <table className="w-full min-w-[560px] text-left text-xs">
          <thead className="text-faint">
            <tr>
              <th className="px-3 py-2 font-normal">started</th>
              <th className="px-3 py-2 font-normal">kind</th>
              <th className="px-3 py-2 font-normal">status</th>
              <th className="px-3 py-2 font-normal">stats / error</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {runs.map((r) => (
              <tr key={r.id}>
                <td className="whitespace-nowrap px-3 py-2">{r.startedAt.slice(0, 16).replace("T", " ")}</td>
                <td className="px-3 py-2">{r.kind}</td>
                <td className={`px-3 py-2 ${r.status === "success" ? "text-verified" : r.status === "failed" ? "text-risk" : "text-warn"}`}>{r.status}</td>
                <td className="max-w-[420px] truncate px-3 py-2 text-dim" title={r.error ?? JSON.stringify(r.stats)}>
                  {r.error ?? `pairs ${r.stats.pairsScanned ?? "—"} · anomalies ${r.stats.anomalies ?? "—"} · ${r.stats.durationMs ?? "—"}ms`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>

      <Panel label="fetch logs" bodyClassName="max-h-[420px] overflow-auto p-0">
        <table className="w-full min-w-[560px] text-left text-xs">
          <thead className="sticky top-0 bg-panel-2 text-faint">
            <tr>
              <th className="px-3 py-2 font-normal">time</th>
              <th className="px-3 py-2 font-normal">source</th>
              <th className="px-3 py-2 font-normal">ok</th>
              <th className="px-3 py-2 font-normal">ms</th>
              <th className="px-3 py-2 font-normal">tries</th>
              <th className="px-3 py-2 font-normal">items</th>
              <th className="px-3 py-2 font-normal">error</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {logs.map((l) => (
              <tr key={`${l.id}-${l.source}`}>
                <td className="whitespace-nowrap px-3 py-1.5">{l.createdAt.slice(5, 16).replace("T", " ")}</td>
                <td className="px-3 py-1.5">{l.source}</td>
                <td className={`px-3 py-1.5 ${l.ok ? "text-verified" : "text-risk"}`}>{l.ok ? "✓" : "✕"}</td>
                <td className="px-3 py-1.5">{l.durationMs}</td>
                <td className="px-3 py-1.5">{l.attempts}</td>
                <td className="px-3 py-1.5">{l.items}</td>
                <td className="max-w-[260px] truncate px-3 py-1.5 text-risk" title={l.error}>
                  {l.error}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>

      <Panel label="rss feeds">
        <ul className="divide-y divide-line">
          {feeds.map((f) => (
            <li key={f.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-sm">
              <span className={`text-xs ${f.enabled ? "text-verified" : "text-faint"}`}>{f.enabled ? "●" : "○"}</span>
              <span className="font-bold">{f.id}</span>
              <span className="min-w-0 flex-1 truncate text-xs text-dim" title={f.url}>
                {f.url}
              </span>
              <span className="text-[11px] text-faint">{f.category}{f.keywords?.length ? ` · ${f.keywords.length} kw` : ""}</span>
              <button className="text-xs text-dim hover:text-ink" onClick={() => toggleFeed(f)}>
                {f.enabled ? "disable" : "enable"}
              </button>
              <button className="text-xs text-dim hover:text-ink" onClick={() => setEdit({ ...f, keywords: f.keywords ?? [] })}>
                edit
              </button>
              <button className="text-xs text-risk/80 hover:text-risk" onClick={() => removeFeed(f.id)}>
                delete
              </button>
            </li>
          ))}
        </ul>
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          <input className={input} placeholder="id (e.g. jito-blog)" value={edit.id} onChange={(e) => setEdit({ ...edit, id: e.target.value })} />
          <input className={input} placeholder="name" value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} />
          <input className={`${input} sm:col-span-2`} placeholder="https://…/rss.xml" value={edit.url} onChange={(e) => setEdit({ ...edit, url: e.target.value })} />
          <select className={input} value={edit.category} onChange={(e) => setEdit({ ...edit, category: e.target.value })}>
            <option value="official">official</option>
            <option value="project">project</option>
            <option value="news">news</option>
          </select>
          <input
            className={input}
            placeholder="keywords, comma separated (empty = all items)"
            value={(edit.keywords ?? []).join(", ")}
            onChange={(e) =>
              setEdit({
                ...edit,
                keywords: e.target.value
                  .split(",")
                  .map((s) => s.trim())
                  .filter(Boolean),
              })
            }
          />
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <button className={buttonClass("primary")} onClick={saveFeed}>
            &gt;_ save feed
          </button>
          <button className={buttonClass("ghost")} onClick={() => setEdit(EMPTY_FEED)}>
            clear
          </button>
        </div>
      </Panel>
    </div>
  );
}
