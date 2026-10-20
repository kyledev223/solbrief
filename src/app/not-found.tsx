import { CmdLink, Container, Panel } from "@/components/ui";

export default function NotFound() {
  return (
    <Container className="py-16">
      <Panel label="error · 404">
        <p className="text-sm text-dim">
          <span className="text-risk">bash:</span> no such file or directory
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <CmdLink href="/">home</CmdLink>
          <CmdLink href="/brief/today">/brief</CmdLink>
        </div>
      </Panel>
    </Container>
  );
}
