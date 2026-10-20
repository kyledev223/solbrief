import { fail, json, limited, requireViewer } from "@/lib/api";
import { getStore } from "@/lib/db";
import { deliverTo } from "@/lib/delivery";

/** Sends the latest digest to the viewer's configured channel. */
export async function POST(req: Request) {
  const g = await requireViewer(req, { minTier: "WHALE", write: true });
  if (g.error) return g.error;
  const rl = limited(req, "research", g.viewer.wallet);
  if (rl) return rl;
  const brief = await getStore().latestBrief();
  if (!brief) return fail(404, "No brief published yet");
  try {
    await deliverTo(g.viewer.user!, brief.content);
    return json({ ok: true });
  } catch (err) {
    return fail(400, err instanceof Error ? err.message : "delivery failed");
  }
}
