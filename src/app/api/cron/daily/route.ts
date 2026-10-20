import { cronHandler } from "@/lib/cron";
import { runJob } from "@/lib/jobs";

export const maxDuration = 300;

// Vercel Cron sends GET with `Authorization: Bearer $CRON_SECRET`; GitHub Actions uses POST.
const handler = (req: Request) =>
  cronHandler(req, async () => {
    const r = await runJob("daily", { force: new URL(req.url).searchParams.get("force") === "1" });
    return { runId: r.runId, status: r.status, stats: r.stats };
  });

export { handler as GET, handler as POST };
