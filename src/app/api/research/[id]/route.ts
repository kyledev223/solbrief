import { fail, json, requireViewer } from "@/lib/api";
import { getStore } from "@/lib/db";

export async function GET(req: Request, ctx: RouteContext<"/api/research/[id]">) {
  const g = await requireViewer(req, { minTier: "WHALE" });
  if (g.error) return g.error;
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return fail(400, "Invalid id");
  const r = await getStore().getResearch(id);
  if (!r || r.wallet !== g.viewer.wallet) return fail(404, "Not found");
  return json(r);
}
