"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { BriefSection } from "@/lib/brief/schema";
import { SectionView, type MentionToken } from "./BriefView";
import { Skeleton } from "./ui";

/** Personalized sections appended to the brief for HOLDER+ (generated per topic, cached per day). */
export function PersonalSections({ startAt }: { startAt: number }) {
  const [state, setState] = useState<{ loading: boolean; sections: BriefSection[]; tokens: MentionToken[]; error?: string }>({ loading: true, sections: [], tokens: [] });

  useEffect(() => {
    let alive = true;
    fetch("/api/personal", { cache: "no-store" })
      .then(async (r) => {
        const d = await r.json();
        if (!alive) return;
        setState(r.ok ? { loading: false, sections: d.sections ?? [], tokens: d.tokens ?? [] } : { loading: false, sections: [], tokens: [], error: d.error });
      })
      .catch(() => alive && setState({ loading: false, sections: [], tokens: [], error: "Could not load personalized sections." }));
    return () => {
      alive = false;
    };
  }, []);

  const tokens = new Map(state.tokens.map((t) => [t.id, t]));
  return (
    <section className="space-y-10" aria-label="Personalized sections">
      <div className="rounded-md border border-cyan/30 bg-cyan/5 px-4 py-3 text-sm text-dim">
        <span className="text-cyan">◆ personalized</span> — sections for your topics.{" "}
        <Link href="/dashboard#topics" className="text-cyan underline underline-offset-2">
          edit topics
        </Link>
      </div>
      {state.loading && <Skeleton lines={4} />}
      {state.error && <p className="text-sm text-risk">{state.error}</p>}
      {!state.loading && !state.error && state.sections.length === 0 && <p className="text-sm text-faint">No topics yet — pick up to 5 in your dashboard.</p>}
      {state.sections.map((s, i) => (
        <SectionView key={s.id} n={startAt + i} section={s} tokens={tokens} emptyText="Nothing in today's data matched this topic." />
      ))}
    </section>
  );
}
