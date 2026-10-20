import type { BriefItem, BriefSection } from "@/lib/brief/schema";
import type { RiskFlag } from "@/lib/types";
import { RiskChips } from "./RiskChips";
import { SectionHeader, TypeBadge } from "./ui";

export interface MentionToken {
  id: string;
  symbol: string;
  pairUrl: string;
  risk: RiskFlag[];
}

export function ItemCard({ item, tokens }: { item: BriefItem; tokens: Map<string, MentionToken> }) {
  const mentioned = item.tokenIds.map((id) => tokens.get(id)).filter((t): t is MentionToken => Boolean(t));
  return (
    <li className="hover-glow min-w-0 rounded-md border border-line bg-panel/80 p-4">
      <div className="flex flex-wrap items-start gap-2">
        <TypeBadge type={item.type} />
        <h3 className="min-w-0 flex-1 text-[15px] font-bold leading-snug text-ink">{item.headline}</h3>
      </div>
      <p className="mt-2 text-sm leading-relaxed text-dim">{item.body}</p>

      {mentioned.length > 0 && (
        <div className="mt-3 space-y-2 border-t border-line pt-3">
          {mentioned.map((t) => (
            <div key={t.id} className="flex flex-wrap items-center gap-2">
              <a href={t.pairUrl} target="_blank" rel="noopener noreferrer" className="text-xs font-bold text-ink hover:text-cyan">
                ${t.symbol}
              </a>
              <RiskChips flags={t.risk} />
            </div>
          ))}
        </div>
      )}

      {item.sources.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-[11px]">
          <span className="text-faint">src:</span>
          {item.sources.map((s, i) => (
            <a key={`${i}-${s.url}`} href={s.url} target="_blank" rel="noopener noreferrer nofollow" className="max-w-full truncate text-cyan/90 hover:text-cyan">
              {s.label} ↗
            </a>
          ))}
        </div>
      )}
    </li>
  );
}

export function SectionView({ n, section, tokens, emptyText, note }: { n: number; section: BriefSection; tokens: Map<string, MentionToken>; emptyText?: string; note?: string }) {
  return (
    <section className="min-w-0">
      <SectionHeader n={n} title={section.title} id={section.id} sub={note} />
      {section.items.length ? (
        <ul className="grid gap-3">
          {section.items.map((item, i) => (
            <ItemCard key={`${section.id}-${i}`} item={item} tokens={tokens} />
          ))}
        </ul>
      ) : (
        <p className="rounded-md border border-dashed border-line-2 p-4 text-sm text-faint">{emptyText ?? "Nothing met the thresholds today."}</p>
      )}
    </section>
  );
}
