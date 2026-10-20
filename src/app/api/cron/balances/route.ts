import { recheckStaleBalances } from "@/lib/balance";
import { cronHandler } from "@/lib/cron";
import { getStore } from "@/lib/db";

export const maxDuration = 120;

const handler = (req: Request) => cronHandler(req, () => recheckStaleBalances(getStore(), 150));

export { handler as GET, handler as POST };
