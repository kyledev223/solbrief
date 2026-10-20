import { describe, it, expect, beforeAll } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import fs from "node:fs";
import path from "node:path";

// Applies the real migration + seed to an in-process Postgres and exercises
// the quota functions the API relies on.
const root = path.resolve(__dirname, "..");
const migration = fs
  .readFileSync(path.join(root, "supabase/migrations/0001_init.sql"), "utf8")
  // PGlite ships gen_random_uuid() natively; pgcrypto isn't bundled.
  .replace(/create extension[^;]+;/gi, "")
  // Supabase-specific roles don't exist in vanilla Postgres.
  .replace(/revoke execute[^;]+;/gi, "");
const seed = fs.readFileSync(path.join(root, "supabase/seed.sql"), "utf8");

describe("supabase migration", () => {
  let db: PGlite;

  beforeAll(async () => {
    db = new PGlite();
    await db.exec(migration);
    await db.exec(seed);
  });

  it("seeds the default RSS feeds", async () => {
    const res = await db.query<{ n: number }>("select count(*)::int as n from rss_feeds");
    expect(res.rows[0].n).toBeGreaterThanOrEqual(5);
  });

  it("consume_usage enforces the daily limit atomically", async () => {
    const results: boolean[] = [];
    for (let i = 0; i < 4; i++) {
      const r = await db.query<{ allowed: boolean; used: number }>(
        "select * from consume_usage($1, $2, $3)",
        ["wallet1", "ask", 3],
      );
      results.push(r.rows[0].allowed);
    }
    expect(results).toEqual([true, true, true, false]);

    const other = await db.query<{ allowed: boolean }>("select * from consume_usage($1,$2,$3)", ["wallet1", "research", 1]);
    expect(other.rows[0].allowed).toBe(true);
  });

  it("refund_usage gives a unit back", async () => {
    await db.query("select refund_usage($1, $2)", ["wallet1", "ask"]);
    const r = await db.query<{ allowed: boolean; used: number }>("select * from consume_usage($1,$2,$3)", ["wallet1", "ask", 3]);
    expect(r.rows[0]).toEqual({ allowed: true, used: 3 });
  });

  it("is idempotent (re-running is safe)", async () => {
    await expect(db.exec(migration)).resolves.toBeDefined();
    await expect(db.exec(seed)).resolves.toBeDefined();
  });
});
