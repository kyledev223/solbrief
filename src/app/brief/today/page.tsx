import type { Metadata } from "next";
import { Suspense } from "react";
import { BriefPage } from "@/components/BriefPage";
import { Container, Skeleton } from "@/components/ui";

export const metadata: Metadata = { title: "Today's brief" };

export default function TodayPage() {
  return (
    <Container className="py-10">
      <Suspense fallback={<Skeleton lines={8} />}>
        <BriefPage />
      </Suspense>
    </Container>
  );
}
