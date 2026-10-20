import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { BriefPage } from "@/components/BriefPage";
import { Container, Skeleton } from "@/components/ui";

export async function generateMetadata({ params }: PageProps<"/brief/[date]">): Promise<Metadata> {
  const { date } = await params;
  return { title: `Brief ${date}` };
}

async function DatedBrief({ params }: { params: PageProps<"/brief/[date]">["params"] }) {
  const { date } = await params;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date))) notFound();
  return <BriefPage date={date} />;
}

export default function DatedBriefPage({ params }: PageProps<"/brief/[date]">) {
  return (
    <Container className="py-10">
      <Suspense fallback={<Skeleton lines={8} />}>
        <DatedBrief params={params} />
      </Suspense>
    </Container>
  );
}
