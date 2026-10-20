import { z } from "zod";
import type { RiskFlag } from "../types";

export const SECTION_IDS = ["market", "launches", "unusual", "ecosystem", "why"] as const;
export type SectionId = (typeof SECTION_IDS)[number];

export const SECTION_TITLES: Record<SectionId, string> = {
  market: "Market overview",
  launches: "Noteworthy launches",
  unusual: "Unusual volume & liquidity",
  ecosystem: "Ecosystem announcements",
  why: "Why it matters",
};

/**
 * What the LLM must return for one item. It cites facts by id; the server
 * resolves those ids into source links and attaches risk flags, so the model
 * never has to (and cannot) supply URLs or risk data itself.
 */
export const LlmItemSchema = z
  .object({
    type: z.enum(["VERIFIED", "SPECULATION"]).describe("VERIFIED only when every claim is backed by the cited facts; otherwise SPECULATION"),
    headline: z.string().min(3).max(160),
    body: z.string().min(10).max(900),
    factIds: z.array(z.string()).max(8).describe("ids of the facts this item relies on, copied exactly from the input"),
    tokenIds: z.array(z.string()).max(6).describe("ids (tok:...) of every token mentioned in this item"),
  })
  .superRefine((item, ctx) => {
    if (item.type === "VERIFIED" && item.factIds.length === 0) {
      ctx.addIssue({ code: "custom", path: ["factIds"], message: "VERIFIED items must cite at least one fact id" });
    }
  });
export type LlmItem = z.infer<typeof LlmItemSchema>;

export const LlmSectionSchema = z.object({
  items: z.array(LlmItemSchema).max(8),
});
export type LlmSection = z.infer<typeof LlmSectionSchema>;

export const LlmHeadlineSchema = z.object({
  headline: z.string().min(5).max(140),
});

// ── Stored (server-enriched) brief ───────────────────────────────────────

export const SourceSchema = z.object({ label: z.string(), url: z.string().url() });
export type Source = z.infer<typeof SourceSchema>;

export const BriefItemSchema = z.object({
  type: z.enum(["VERIFIED", "SPECULATION"]),
  headline: z.string(),
  body: z.string(),
  factIds: z.array(z.string()),
  tokenIds: z.array(z.string()),
  sources: z.array(SourceSchema),
});
export type BriefItem = z.infer<typeof BriefItemSchema>;

export const BriefSectionSchema = z.object({
  id: z.string(),
  title: z.string(),
  items: z.array(BriefItemSchema),
});
export type BriefSection = z.infer<typeof BriefSectionSchema>;

export const BriefSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  headline: z.string(),
  sections: z.array(BriefSectionSchema),
  omitted: z.array(z.string()),
  mode: z.enum(["llm", "facts-only"]),
  model: z.string().nullable(),
  generatedAt: z.string(),
  disclaimer: z.string(),
});
export type Brief = z.infer<typeof BriefSchema>;

/** Token data the UI shows next to a mention (subset of TokenFact). */
export interface TokenMention {
  id: string;
  symbol: string;
  mint: string;
  pairUrl: string;
  risk: RiskFlag[];
}

// ── Ask the Brief ────────────────────────────────────────────────────────

export const AskAnswerSchema = z.object({
  answer: z.string().min(1).max(2000),
  type: z.enum(["VERIFIED", "SPECULATION", "INSUFFICIENT_DATA"]),
  factIds: z.array(z.string()).max(10),
  tokenIds: z.array(z.string()).max(6),
});
export type AskAnswer = z.infer<typeof AskAnswerSchema>;

// ── Deep Research ────────────────────────────────────────────────────────

export const ResearchOutputSchema = z.object({
  title: z.string().min(3).max(140),
  summary: z.string().min(10).max(1200),
  sections: z
    .array(
      z.object({
        heading: z.string().min(2).max(100),
        items: z.array(LlmItemSchema).max(8),
      }),
    )
    .min(1)
    .max(7),
  openQuestions: z.array(z.string().max(300)).max(8),
});
export type ResearchOutput = z.infer<typeof ResearchOutputSchema>;

/** Stored Deep Research report (server-resolved sources + risk flags). */
export interface ResearchReport {
  title: string;
  summary: string;
  sections: Array<{ heading: string; items: BriefItem[] }>;
  openQuestions: string[];
  tokens: TokenMention[];
  sources: Source[];
  model: string | null;
  generatedAt: string;
}
