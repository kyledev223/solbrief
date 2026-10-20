import { z } from "zod";
import { fail, json, limited, parseBody, requireViewer } from "@/lib/api";
import { getStore } from "@/lib/db";

const Feed = z.object({
  id: z
    .string()
    .trim()
    .regex(/^[a-z0-9-]{2,40}$/, "lowercase letters, digits and dashes"),
  name: z.string().trim().min(2).max(60),
  url: z
    .string()
    .trim()
    .url()
    .refine((u) => u.startsWith("https://"), "must be https"),
  category: z.enum(["official", "project", "news"]),
  keywords: z.array(z.string().trim().min(2).max(40)).max(20).default([]),
  enabled: z.boolean(),
});

async function guard(req: Request, write: boolean) {
  const g = await requireViewer(req, { admin: true, write });
  if (g.error) return g.error;
  return limited(req, "admin", g.viewer.wallet);
}

export async function GET(req: Request) {
  const err = await guard(req, false);
  if (err) return err;
  return json({ feeds: await getStore().listFeeds() });
}

export async function PUT(req: Request) {
  const err = await guard(req, true);
  if (err) return err;
  const body = await parseBody(req, Feed);
  if ("error" in body) return body.error;
  await getStore().upsertFeed(body.data);
  return json({ feeds: await getStore().listFeeds() });
}

export async function DELETE(req: Request) {
  const err = await guard(req, true);
  if (err) return err;
  const id = new URL(req.url).searchParams.get("id");
  if (!id || !/^[a-z0-9-]{2,40}$/.test(id)) return fail(400, "Invalid id");
  await getStore().deleteFeed(id);
  return json({ feeds: await getStore().listFeeds() });
}
