import "server-only";
import { fail, isCronAuthorized, json, limited } from "./api";

/** Wraps a cron job: rate limit, CRON_SECRET check, JSON result, never leaks stack traces. */
export async function cronHandler(req: Request, job: () => Promise<unknown>): Promise<Response> {
  const rl = limited(req, "cron");
  if (rl) return rl;
  if (!isCronAuthorized(req)) return fail(401, "Unauthorized");
  try {
    return json({ ok: true, result: await job() });
  } catch (err) {
    console.error("[cron]", err);
    return fail(500, err instanceof Error ? err.message.slice(0, 300) : "job failed");
  }
}
