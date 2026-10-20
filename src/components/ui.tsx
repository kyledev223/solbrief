import Link from "next/link";
import type { ReactNode } from "react";

export function Panel({
  label,
  live,
  right,
  children,
  className = "",
  bodyClassName = "p-4",
}: {
  label: string;
  live?: boolean;
  right?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section className={`min-w-0 overflow-hidden rounded-md border border-line bg-panel/85 backdrop-blur-sm ${className}`}>
      <header className="flex items-center justify-between gap-3 border-b border-line bg-panel-2/90 px-3 py-2 text-[11px] text-dim">
        <div className="flex min-w-0 items-center gap-2">
          <span aria-hidden className="flex gap-1">
            <span className="h-2 w-2 rounded-full bg-line-2" />
            <span className="h-2 w-2 rounded-full bg-line-2" />
            <span className="h-2 w-2 rounded-full bg-line-2" />
          </span>
          <span className="truncate uppercase tracking-wider">{label}</span>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          {right}
          {live && (
            <span className="flex items-center gap-1.5 text-cyan">
              <span aria-hidden className="h-1.5 w-1.5 animate-pulse-dot rounded-full bg-cyan" />
              live
            </span>
          )}
        </div>
      </header>
      <div className={bodyClassName}>{children}</div>
    </section>
  );
}

export function SectionHeader({ n, title, sub, id }: { n: number; title: string; sub?: ReactNode; id?: string }) {
  return (
    <div id={id} className="mb-5 scroll-mt-24">
      <h2 className="text-2xl font-extrabold tracking-tight text-ink sm:text-3xl">
        <span className="text-gradient">{String(n).padStart(2, "0")}</span>
        <span className="mx-2 text-faint">·</span>
        {title.toUpperCase()}
      </h2>
      {sub && <p className="mt-1.5 text-sm text-dim">{sub}</p>}
    </div>
  );
}

export function CmdLink({ href, children, variant = "ghost", className = "" }: { href: string; children: ReactNode; variant?: "primary" | "ghost"; className?: string }) {
  return (
    <Link href={href} className={`${buttonClass(variant)} ${className}`}>
      <span aria-hidden className="text-cyan">&gt;_</span> {children}
    </Link>
  );
}

export function buttonClass(variant: "primary" | "ghost" | "danger" = "ghost") {
  const base =
    "inline-flex items-center justify-center gap-1.5 rounded-md border px-3.5 py-2 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50";
  if (variant === "primary") return `${base} border-violet/60 bg-violet/20 text-ink hover:bg-violet/30 glow`;
  if (variant === "danger") return `${base} border-risk/50 bg-risk/10 text-risk hover:bg-risk/20`;
  return `${base} border-line-2 bg-panel text-dim hover:border-violet/50 hover:text-ink`;
}

export function TypeBadge({ type }: { type: "VERIFIED" | "SPECULATION" | "INSUFFICIENT_DATA" }) {
  if (type === "VERIFIED")
    return (
      <span className="inline-flex shrink-0 items-center gap-1 rounded border border-verified/45 bg-verified/10 px-1.5 py-0.5 text-[10px] font-bold tracking-wider text-verified">
        ✓ VERIFIED
      </span>
    );
  if (type === "SPECULATION")
    return (
      <span className="inline-flex shrink-0 items-center gap-1 rounded border border-violet/50 bg-violet/10 px-1.5 py-0.5 text-[10px] font-bold tracking-wider text-violet-soft">
        ~ SPECULATION
      </span>
    );
  return <span className="inline-flex shrink-0 items-center rounded border border-line-2 px-1.5 py-0.5 text-[10px] font-bold tracking-wider text-dim">∅ NO DATA</span>;
}

export function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: ReactNode }) {
  return (
    <div className="min-w-0 rounded border border-line bg-bg/60 px-3 py-2.5">
      <div className="text-[10px] uppercase tracking-wider text-faint">{label}</div>
      <div className="mt-0.5 truncate text-lg font-bold text-ink">{value}</div>
      {hint && <div className="truncate text-[11px] text-dim">{hint}</div>}
    </div>
  );
}

export function Prompt({ children }: { children: ReactNode }) {
  return (
    <span>
      <span className="text-violet">❯</span> {children}
      <span aria-hidden className="ml-0.5 inline-block h-[1.05em] w-[0.55em] translate-y-[0.15em] animate-blink bg-cyan" />
    </span>
  );
}

export function Container({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`mx-auto w-full max-w-6xl px-4 sm:px-6 ${className}`}>{children}</div>;
}

export function Skeleton({ lines = 3 }: { lines?: number }) {
  return (
    <div className="space-y-2" aria-busy="true" aria-live="polite">
      {Array.from({ length: lines }, (_, i) => (
        <div key={i} className="h-3 animate-pulse rounded bg-line" style={{ width: `${90 - i * 12}%` }} />
      ))}
      <span className="sr-only">Loading…</span>
    </div>
  );
}
