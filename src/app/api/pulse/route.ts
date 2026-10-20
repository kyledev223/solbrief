import { json, limited } from "@/lib/api";
import { getPulse } from "@/lib/data";

/** Public: latest pipeline stats (no user data). */
export async function GET(req: Request) {
  const rl = limited(req, "default");
  if (rl) return rl;
  return json(await getPulse(), { headers: { "cache-control": "public, s-maxage=60, stale-while-revalidate=300" } });
}
