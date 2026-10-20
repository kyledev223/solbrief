import { GoogleGenAI } from "@google/genai";
import { z } from "zod";
import { GEMINI } from "@/config/site";
import { backoffMs, sleep } from "../http";

/**
 * Gemini client tuned for the free tier:
 *  - a process-wide queue spaces requests to stay under the RPM budget
 *  - 429/5xx are retried with exponential backoff, honoring server retryDelay
 *  - a long quota wait (daily cap) switches to the fallback model
 *  - output is JSON-constrained by a schema derived from the zod schema,
 *    then validated again with zod (the model's constraint is not trusted)
 */

export class LlmUnavailableError extends Error {
  name = "LlmUnavailableError";
}

export class LlmValidationError extends Error {
  name = "LlmValidationError";
  constructor(
    message: string,
    public issues: string[],
    public raw: string,
  ) {
    super(message);
  }
}

class RateQueue {
  private chain: Promise<unknown> = Promise.resolve();
  private last = 0;
  constructor(private minIntervalMs: number) {}

  schedule<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.chain.then(async () => {
      const wait = this.last + this.minIntervalMs - Date.now();
      if (wait > 0) await sleep(wait);
      try {
        return await fn();
      } finally {
        this.last = Date.now();
      }
    });
    this.chain = run.catch(() => undefined);
    return run;
  }
}

const queue = new RateQueue(Math.ceil(60_000 / Math.max(1, GEMINI.rpm)));
let client: GoogleGenAI | null = null;

function getClient(): GoogleGenAI {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new LlmUnavailableError("GEMINI_API_KEY is not set");
  client ??= new GoogleGenAI({ apiKey: key });
  return client;
}

export function hasLlm(): boolean {
  return Boolean(process.env.GEMINI_API_KEY);
}

/** JSON Schema for Gemini's responseJsonSchema (drops keywords it rejects). */
export function toGeminiSchema(schema: z.ZodType): Record<string, unknown> {
  const json = z.toJSONSchema(schema, { target: "draft-07", unrepresentable: "any" }) as Record<string, unknown>;
  const clean = (node: unknown): unknown => {
    if (Array.isArray(node)) return node.map(clean);
    if (node && typeof node === "object") {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(node)) {
        if (k === "$schema" || k === "additionalProperties" || k === "$id") continue;
        out[k] = clean(v);
      }
      return out;
    }
    return node;
  };
  return clean(json) as Record<string, unknown>;
}

function statusOf(err: unknown): number | undefined {
  const e = err as { status?: number; code?: number };
  return e?.status ?? e?.code;
}

/** Server-suggested retry delay in ms (from google.rpc.RetryInfo), if any. */
export function retryDelayMs(err: unknown): number | null {
  const msg = err instanceof Error ? err.message : String(err);
  const m = msg.match(/"retryDelay"\s*:\s*"(\d+(?:\.\d+)?)s"/);
  return m ? Math.ceil(Number(m[1]) * 1000) : null;
}

export interface GenerateOpts {
  system: string;
  prompt: string;
  /** Override model (defaults to GEMINI.model). */
  model?: string;
  maxOutputTokens?: number;
}

export interface GenerateResult<T> {
  data: T;
  model: string;
}

async function callOnce(model: string, opts: GenerateOpts, jsonSchema: Record<string, unknown>): Promise<string> {
  const res = await getClient().models.generateContent({
    model,
    contents: [{ role: "user", parts: [{ text: opts.prompt }] }],
    config: {
      systemInstruction: opts.system,
      responseMimeType: "application/json",
      responseJsonSchema: jsonSchema,
      maxOutputTokens: opts.maxOutputTokens ?? 4096,
      abortSignal: AbortSignal.timeout(GEMINI.timeoutMs),
    },
  });
  const text = res.text;
  if (!text) throw new Error(`empty response from ${model} (finishReason=${res.candidates?.[0]?.finishReason ?? "?"})`);
  return text;
}

/**
 * Generate JSON that must satisfy `schema`. Throws LlmValidationError when the
 * model's output doesn't validate (caller decides whether to retry with
 * feedback), LlmUnavailableError when the API can't be reached in budget.
 */
export async function generateJson<T>(schema: z.ZodType<T>, opts: GenerateOpts): Promise<GenerateResult<T>> {
  const jsonSchema = toGeminiSchema(schema);
  let model = opts.model ?? GEMINI.model;
  let lastErr: unknown;

  for (let attempt = 0; attempt < GEMINI.maxAttempts; attempt++) {
    try {
      const raw = await queue.schedule(() => callOnce(model, opts, jsonSchema));
      let parsed: unknown;
      try {
        parsed = JSON.parse(raw);
      } catch {
        throw new LlmValidationError("model returned invalid JSON", ["response is not valid JSON"], raw);
      }
      const v = schema.safeParse(parsed);
      if (!v.success) {
        const issues = v.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`).slice(0, 12);
        throw new LlmValidationError("schema validation failed", issues, raw);
      }
      return { data: v.data, model };
    } catch (err) {
      if (err instanceof LlmValidationError || err instanceof LlmUnavailableError) throw err;
      lastErr = err;
      const status = statusOf(err);
      const retryable = status === undefined || status === 429 || status === 408 || status >= 500;
      if (!retryable) break;
      const suggested = retryDelayMs(err);
      if (status === 429 && suggested != null && suggested > 60_000 && model !== GEMINI.fallbackModel) {
        console.warn(`[gemini] ${model} quota exhausted (retry in ${Math.round(suggested / 1000)}s) — switching to ${GEMINI.fallbackModel}`);
        model = GEMINI.fallbackModel;
        continue;
      }
      if (attempt === GEMINI.maxAttempts - 2 && status === 429 && model !== GEMINI.fallbackModel) model = GEMINI.fallbackModel;
      const wait = Math.min(60_000, suggested ?? backoffMs(attempt, 2_000, 30_000));
      console.warn(`[gemini] attempt ${attempt + 1} failed (${status ?? "network"}): retrying in ${Math.round(wait / 1000)}s`);
      await sleep(wait);
    }
  }
  throw new LlmUnavailableError(`Gemini unavailable: ${lastErr instanceof Error ? lastErr.message.slice(0, 300) : String(lastErr)}`);
}
