"use client";

import { Container, Panel, buttonClass } from "@/components/ui";

export default function Error({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <Container className="py-16">
      <Panel label="error · 500">
        <p className="text-sm text-dim">
          <span className="text-risk">panic:</span> something went wrong rendering this page.
        </p>
        <button onClick={reset} className={`${buttonClass("ghost")} mt-4`}>
          &gt;_ retry
        </button>
      </Panel>
    </Container>
  );
}
