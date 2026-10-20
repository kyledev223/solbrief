export function usd(n: number | null | undefined, opts: { compact?: boolean } = { compact: true }): string {
  if (n == null || !Number.isFinite(n)) return "—";
  const a = Math.abs(n);
  if (opts.compact !== false) {
    if (a >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
    if (a >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
    if (a >= 1e3) return `$${(n / 1e3).toFixed(1)}K`;
  }
  if (a >= 1) return `$${n.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
  if (a === 0) return "$0";
  return `$${n.toPrecision(3)}`;
}

export function pct(n: number | null | undefined, digits = 1): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return `${n > 0 ? "+" : ""}${n.toFixed(digits)}%`;
}

export function age(hours: number | null | undefined): string {
  if (hours == null) return "—";
  if (hours < 1) return `${Math.max(1, Math.round(hours * 60))}m`;
  if (hours < 48) return `${hours.toFixed(1)}h`;
  return `${Math.round(hours / 24)}d`;
}

export function amount(n: number): string {
  return n.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

export function shortAddr(a: string, n = 4): string {
  return a.length > 2 * n + 3 ? `${a.slice(0, n)}…${a.slice(-n)}` : a;
}

export function utcTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  return `${iso.slice(11, 16)} UTC`;
}

export function utcDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  return `${iso.slice(0, 10)} ${iso.slice(11, 16)} UTC`;
}
