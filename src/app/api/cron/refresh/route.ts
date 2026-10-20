import { cronHandler } from "@/lib/cron";
import { runJob } from "@/lib/jobs";

export const maxDuration = 300;

const handler = (req: Request) =>
  cronHandler(req, async () => {
    const r = await runJob("refresh");
    return { runId: r.runId, status: r.status, stats: r.stats };
  });

export { handler as GET, handler as POST };
