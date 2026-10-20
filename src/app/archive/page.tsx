import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { Gate } from "@/components/tiers";
import { Container, Panel, SectionHeader, Skeleton } from "@/components/ui";
import { safeBriefList, safeLatestBrief } from "@/lib/data";
import { utcTime } from "@/lib/format";
import { visibleBefore } from "@/lib/tiers";
import { getViewer } from "@/lib/viewer";

export const metadata: Metadata = { title: "Archive" };

async function ArchiveList() {
  await connection();
  const [viewer, list, latestFree] = await Promise.all([getViewer(), safeBriefList(120), safeLatestBrief(visibleBefore("FREE"))]);
  const free = viewer.tier === "FREE";
  if (!list.length) return <Panel label="archive"><p className="text-sm text-dim">No briefs yet.</p></Panel>;
  return (
    <div className="space-y-4">
      {free && <Gate need="HOLDER" title="The full archive is for holders" />}
      <Panel label={`archive · ${list.length} briefs`} bodyClassName="p-0">
        <ul className="divide-y divide-line">
          {list.map((b) => {
            const open = !free || b.briefDate === latestFree?.briefDate;
            return (
              <li key={b.briefDate} className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 text-sm">
                <span className="shrink-0 font-bold text-ink">{b.briefDate}</span>
                <span className="min-w-0 flex-1 truncate text-dim">{b.headline}</span>
                <span className="shrink-0 text-[11px] text-faint">{utcTime(b.publishedAt)}</span>
                {open ? (
                  <Link href={`/brief/${b.briefDate}`} className="shrink-0 text-xs text-cyan hover:text-ink">&gt;_ open</Link>
                ) : (
                  <span className="shrink-0 text-xs text-faint">🔒 holders</span>
                )}
              </li>
            );
          })}
        </ul>
      </Panel>
    </div>
  );
}

export default function ArchivePage() {
  return (
    <Container className="py-10">
      <SectionHeader n={1} title="Archive" sub="Every published brief, newest first." />
      <Suspense fallback={<Skeleton lines={6} />}>
        <ArchiveList />
      </Suspense>
    </Container>
  );
}
