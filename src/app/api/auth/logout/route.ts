import { fail, json, sameOrigin } from "@/lib/api";
import { clearSessionCookie } from "@/lib/auth/session";

export async function POST(req: Request) {
  if (!sameOrigin(req)) return fail(403, "Cross-origin request rejected");
  await clearSessionCookie();
  return json({ ok: true });
}
