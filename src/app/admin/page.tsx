import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { AdminPanel } from "@/components/AdminPanel";
import { ConnectButton } from "@/components/ConnectButton";
import { Container, Panel, SectionHeader, Skeleton } from "@/components/ui";
import { getViewer } from "@/lib/viewer";

export const metadata: Metadata = { title: "Admin", robots: { index: false, follow: false } };

async function AdminGate() {
  await connection();
  const v = await getViewer();
  if (!v.wallet)
    return (
      <Panel label="admin · signed out">
        <p className="mb-3 text-sm text-dim">Sign in with an admin wallet.</p>
        <ConnectButton />
      </Panel>
    );
  if (!v.isAdmin)
    return (
      <Panel label="admin">
        <p className="text-sm text-risk">This wallet is not in ADMIN_WALLETS.</p>
      </Panel>
    );
  return <AdminPanel />;
}

export default function AdminPage() {
  return (
    <Container className="py-10">
      <SectionHeader n={0} title="Admin" sub="Trigger runs, inspect source health, manage RSS feeds." />
      <Suspense fallback={<Skeleton lines={6} />}>
        <AdminGate />
      </Suspense>
    </Container>
  );
}
