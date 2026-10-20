import type { RiskFlag } from "@/lib/types";

const SHORT: Record<RiskFlag["key"], string> = {
  MINT_AUTHORITY: "MINT AUTH",
  FREEZE_AUTHORITY: "FREEZE AUTH",
  TOP10_CONCENTRATION: "TOP-10 HEAVY",
  LP_UNLOCKED: "LP UNLOCKED",
  NEW_PAIR: "NEW PAIR",
};

/** Risk flags rendered next to every token mention. Red = high, amber = medium, dashed = unknown. */
export function RiskChips({ flags, compact = false }: { flags: RiskFlag[]; compact?: boolean }) {
  const raised = flags.filter((f) => f.state === "yes");
  const unknown = flags.filter((f) => f.state === "unknown");
  return (
    <ul className="flex flex-wrap gap-1" aria-label="Risk flags">
      {raised.map((f) => (
        <li
          key={f.key}
          title={f.detail ? `${f.label}: ${f.detail}` : f.label}
          className={`rounded border px-1.5 py-0.5 text-[10px] font-bold tracking-wide ${
            f.severity === "high" ? "border-risk/50 bg-risk/12 text-risk" : "border-warn/50 bg-warn/10 text-warn"
          }`}
        >
          ⚠ {SHORT[f.key]}
        </li>
      ))}
      {!compact &&
        unknown.map((f) => (
          <li key={f.key} title={`${f.label}: could not be determined`} className="rounded border border-dashed border-line-2 px-1.5 py-0.5 text-[10px] tracking-wide text-faint">
            ? {SHORT[f.key]}
          </li>
        ))}
      {raised.length === 0 && (
        <li className="rounded border border-line-2 px-1.5 py-0.5 text-[10px] tracking-wide text-dim" title="No risk flag raised by our checks — this is not an endorsement">
          no flags raised
        </li>
      )}
    </ul>
  );
}
