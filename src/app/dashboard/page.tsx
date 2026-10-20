import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { LIMITS } from "@/config/site";
import { ConnectButton } from "@/components/ConnectButton";
import { DeliveryForm, ResearchPanel, TopicsEditor } from "@/components/dashboard";
import { TierCard } from "@/components/tiers";
import { Container, Panel, SectionHeader, Skeleton, Stat } from "@/components/ui";
import { tryGetStore } from "@/lib/db";
import { env } from "@/lib/env";
import { shortAddr } from "@/lib/format";
import { dailyLimit, tierAtLeast, tierRequirement } from "@/lib/tiers";
import { getViewer } from "@/lib/viewer";

export const metadata: Metadata = { title: "Dashboard" };

async function Dashboard() {
  await connection();
  const v = await getViewer();
  if (!v.wallet) {
    return (
      <Panel label="dashboard · signed out">
        <p className="mb-4 text-sm text-dim">Connect a wallet and sign a message to see your tier. No transaction, no fees.</p>
        <ConnectButton />
      </Panel>
    );
  }
  const usage = ((await tryGetStore()?.getUsage(v.wallet).catch(() => ({}))) ?? {}) as Record<string, number>;
  const holder = tierAtLeast(v.tier, "HOLDER");
  const whale = v.tier === "WHALE";

  return (
    <div className="space-y-6">
      <Panel label="tier" live right={<code className="hidden normal-case text-dim sm:inline">{shortAddr(v.wallet, 6)}</code>}>
        <TierCard tier={v.tier} balance={v.balance} checkedAt={v.balanceCheckedAt} mintConfigured={Boolean(env.tokenMint)} />
      </Panel>

      <Panel label="usage · today (UTC)">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Stat label="ask the brief" value={`${usage.ask ?? 0}/${dailyLimit(v.tier, "ask")}`} />
          <Stat label="deep research" value={`${usage.research ?? 0}/${dailyLimit(v.tier, "research")}`} />
          <Stat label="topics" value={`${v.user?.topics.length ?? 0}/${LIMITS.maxTopics}`} />
          <Stat label="digest" value={v.user?.deliveryEnabled ? (v.user.deliveryChannel ?? "on") : "off"} />
        </div>
      </Panel>

      <div id="topics" className="scroll-mt-24">
        <Panel label={`personalized topics${holder ? "" : ` · requires ${tierRequirement("HOLDER")}`}`}>
          <p className="mb-3 text-xs text-dim">Each topic adds a section to your brief built only from that day&apos;s data. Wallets are matched against tokens in today&apos;s signals.</p>
          <TopicsEditor initial={v.user?.topics ?? []} enabled={holder} />
        </Panel>
      </div>

      <Panel label={`deep research${whale ? "" : ` · requires ${tierRequirement("WHALE")}`}`}>
        <ResearchPanel enabled={whale} limit={dailyLimit("WHALE", "research")} />
      </Panel>

      <Panel label={`digest delivery${whale ? "" : ` · requires ${tierRequirement("WHALE")}`}`}>
        <DeliveryForm
          enabled={whale}
          initial={{ channel: v.user?.deliveryChannel ?? null, enabled: v.user?.deliveryEnabled ?? false, telegramChatId: v.user?.telegramChatId ?? null, email: v.user?.email ?? null }}
        />
      </Panel>
    </div>
  );
}

export default function DashboardPage() {
  return (
    <Container className="py-10">
      <SectionHeader n={1} title="Dashboard" sub="Your tier is computed on the server from your on-chain balance and re-checked every 6 hours." />
      <Suspense fallback={<Skeleton lines={6} />}>
        <Dashboard />
      </Suspense>
    </Container>
  );
}
