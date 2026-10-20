import { json, limited, requireViewer } from "@/lib/api";
import { getStore } from "@/lib/db";

export async function GET(req: Request) {
  const g = await requireViewer(req, { admin: true });
  if (g.error) return g.error;
  const rl = limited(req, "admin", g.viewer.wallet);
  if (rl) return rl;
  const store = getStore();
  const [runs, logs] = await Promise.all([store.recentRuns(20), store.recentFetchLogs(150)]);
  return json({ runs, logs });
}
