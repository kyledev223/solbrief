import { z } from "zod";
import { json, limited, parseBody, requireViewer } from "@/lib/api";
import { getStore } from "@/lib/db";

const Body = z
  .object({
    enabled: z.boolean(),
    channel: z.enum(["telegram", "email"]).nullable(),
    telegramChatId: z
      .string()
      .trim()
      .regex(/^-?\d{4,20}$/, "numeric chat id")
      .nullable()
      .optional(),
    email: z.string().trim().email().max(200).nullable().optional(),
  })
  .refine((b) => !b.enabled || (b.channel === "telegram" ? Boolean(b.telegramChatId) : b.channel === "email" ? Boolean(b.email) : false), {
    message: "enabled delivery needs a channel and its destination",
  });

/** Digest delivery preferences (WHALE). */
export async function PUT(req: Request) {
  const g = await requireViewer(req, { minTier: "WHALE", write: true });
  if (g.error) return g.error;
  const rl = limited(req, "default", g.viewer.wallet);
  if (rl) return rl;
  const body = await parseBody(req, Body);
  if ("error" in body) return body.error;
  const b = body.data;
  const u = await getStore().upsertUser(g.viewer.wallet!, {
    deliveryEnabled: b.enabled,
    deliveryChannel: b.channel,
    telegramChatId: b.telegramChatId ?? null,
    email: b.email ?? null,
  });
  return json({ channel: u.deliveryChannel, enabled: u.deliveryEnabled, telegramChatId: u.telegramChatId, email: u.email });
}
