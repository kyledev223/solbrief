import "server-only";
import { jwtVerify, SignJWT } from "jose";
import { cookies } from "next/headers";
import { APP_SLUG, LIMITS } from "@/config/site";
import { env, sessionSecret } from "../env";

export const SESSION_COOKIE = `${APP_SLUG}_session`;

export async function createSessionToken(wallet: string): Promise<string> {
  return new SignJWT({})
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(wallet)
    .setIssuedAt()
    .setExpirationTime(`${LIMITS.sessionDays}d`)
    .sign(sessionSecret());
}

export async function readSessionToken(token: string | undefined): Promise<string | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, sessionSecret(), { algorithms: ["HS256"] });
    return typeof payload.sub === "string" ? payload.sub : null;
  } catch {
    return null;
  }
}

export async function setSessionCookie(wallet: string) {
  (await cookies()).set(SESSION_COOKIE, await createSessionToken(wallet), {
    httpOnly: true,
    secure: env.isProd,
    sameSite: "lax",
    path: "/",
    maxAge: LIMITS.sessionDays * 86_400,
  });
}

export async function clearSessionCookie() {
  (await cookies()).delete(SESSION_COOKIE);
}

/** Wallet from the session cookie, or null. */
export async function sessionWallet(): Promise<string | null> {
  return readSessionToken((await cookies()).get(SESSION_COOKIE)?.value);
}
