import { z } from "zod";
import { LIMITS, TOPIC_PRESETS } from "@/config/site";
import { json, limited, parseBody, requireViewer } from "@/lib/api";
import { isValidSolanaAddress } from "@/lib/auth/siws";
import { getStore } from "@/lib/db";
import { topicKey, type Topic } from "@/lib/types";

const presetKeys = TOPIC_PRESETS.map((p) => p.key) as [string, ...string[]];

const TopicSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("preset"), key: z.enum(presetKeys) }),
  z.object({
    kind: z.literal("project"),
    value: z
      .string()
      .trim()
      .min(2)
      .max(40)
      .regex(/^[\p{L}\p{N} .$_-]+$/u, "letters, numbers, spaces, . $ _ - only"),
  }),
  z.object({
    kind: z.literal("wallet"),
    value: z.string().trim().refine(isValidSolanaAddress, "not a valid Solana address"),
  }),
]);

const Body = z.object({ topics: z.array(TopicSchema).max(LIMITS.maxTopics) });

export async function PUT(req: Request) {
  const g = await requireViewer(req, { minTier: "HOLDER", write: true });
  if (g.error) return g.error;
  const rl = limited(req, "default", g.viewer.wallet);
  if (rl) return rl;
  const body = await parseBody(req, Body);
  if ("error" in body) return body.error;

  const unique = [...new Map(body.data.topics.map((t) => [topicKey(t as Topic), t as Topic])).values()];
  const user = await getStore().upsertUser(g.viewer.wallet!, { topics: unique });
  return json({ topics: user.topics });
}
