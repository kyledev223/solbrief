import type { Metadata } from "next";
import { Suspense } from "react";
import { AskChat } from "@/components/AskChat";
import { Container, SectionHeader, Skeleton } from "@/components/ui";
import { LIMITS } from "@/config/site";

export const metadata: Metadata = { title: "Ask the Brief" };

export default function AskPage() {
  return (
    <Container className="py-10">
      <SectionHeader
        n={1}
        title="Ask the brief"
        sub={`Questions are answered using only today's stored data and sources. HOLDER: ${LIMITS.askPerDay.HOLDER}/day · WHALE: ${LIMITS.askPerDay.WHALE}/day.`}
      />
      <Suspense fallback={<Skeleton lines={5} />}>
        <AskChat />
      </Suspense>
    </Container>
  );
}
