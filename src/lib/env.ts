import "server-only";

/** Server-side environment access with explicit "is this configured?" helpers. */
export const env = {
  // Vercel's Supabase integration also exposes NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SECRET_KEY
  supabaseUrl: process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "",
  supabaseServiceKey: process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || "",
  geminiKey: process.env.GEMINI_API_KEY ?? "",
  rpcUrl: process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com",
  coingeckoKey: process.env.COINGECKO_API_KEY ?? "",
  jupiterKey: process.env.JUPITER_API_KEY ?? "",
  sessionSecret: process.env.SESSION_SECRET ?? "",
  cronSecret: process.env.CRON_SECRET ?? "",
  adminWallets: (process.env.ADMIN_WALLETS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
  telegramBotToken: process.env.TELEGRAM_BOT_TOKEN ?? "",
  resendKey: process.env.RESEND_API_KEY ?? "",
  emailFrom: process.env.EMAIL_FROM ?? "",
  tokenMint: process.env.NEXT_PUBLIC_TOKEN_MINT ?? "",
  isProd: process.env.NODE_ENV === "production",
  devTierOverride: process.env.NODE_ENV !== "production" ? process.env.DEV_TIER_OVERRIDE : undefined,
};

export const hasSupabase = () => Boolean(env.supabaseUrl && env.supabaseServiceKey);
export const hasGemini = () => Boolean(env.geminiKey);

export function sessionSecret(): Uint8Array {
  let secret = env.sessionSecret;
  if (!secret) {
    if (env.isProd) throw new Error("SESSION_SECRET is required in production");
    secret = "dev-only-insecure-session-secret-change-me-please";
  }
  if (secret.length < 32) throw new Error("SESSION_SECRET must be at least 32 characters");
  return new TextEncoder().encode(secret);
}
