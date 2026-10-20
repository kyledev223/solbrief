import { z } from "zod";
import { json, limited, parseBody, requireViewer } from "@/lib/api";
import { runJob } from "@/lib/jobs";

export const maxDuration = 300;

const Body = z.object({ kind: z.enum(["manual", "refresh"]) });

/** Admin: run the pipeline now ("manual" regenerates today's brief). */
export async function POST(req: Request) {
  const g = await requireViewer(req, { admin: true, write: true });
  if (g.error) return g.error;
  const rl = limited(req, "admin", g.viewer.wallet);
  if (rl) return rl;
  const body = await parseBody(req, Body);
  if ("error" in body) return body.error;
  const r = await runJob(body.data.kind);
  return json({ runId: r.runId, status: r.status, stats: r.stats, generationLog: r.generationLog ?? null });
}
