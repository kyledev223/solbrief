import "server-only";
import { env, hasSupabase } from "../env";
import { FileStore } from "./file-store";
import type { Store } from "./store";
import { SupabaseStore } from "./supabase-store";

export * from "./store";

let store: Store | null = null;

/**
 * Supabase when configured; otherwise a local JSON store for development.
 * Production without Supabase is a configuration error.
 */
export function getStore(): Store {
  if (store) return store;
  if (hasSupabase()) {
    store = new SupabaseStore(env.supabaseUrl, env.supabaseServiceKey);
  } else if (env.isProd && !process.env.ALLOW_FILE_STORE) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in production");
  } else {
    store = new FileStore();
  }
  return store;
}

/** Same as getStore() but returns null instead of throwing (for read-only pages). */
export function tryGetStore(): Store | null {
  try {
    return getStore();
  } catch (err) {
    console.error(err);
    return null;
  }
}
