import type { Context, MiddlewareHandler } from "hono";
import { getSignedCookie, setSignedCookie, deleteCookie } from "hono/cookie";
import type { ProviderTokens } from "./providers/types";

export interface ProviderSession {
  tokens: ProviderTokens;
  userId: string;
}

export interface UserSession {
  providers: Record<string, ProviderSession>;
  wallet?: {
    address: string;
    linkedAt: number;
  };
  csrfToken?: string;
}

const COOKIE_NAME = "shipproof_session";
const COOKIE_MAX_AGE = 60 * 60; // 1 hour

export function sessionMiddleware(secret: string): MiddlewareHandler {
  return async (c, next) => {
    const raw = await getSignedCookie(c, secret, COOKIE_NAME);
    let session: UserSession = { providers: {} };
    if (raw) {
      try {
        session = JSON.parse(raw);
      } catch {
        // Corrupted cookie, start fresh
      }
    }
    c.set("session", session);
    await next();
    const updated = c.get("session") as UserSession;
    await setSignedCookie(c, COOKIE_NAME, JSON.stringify(updated), secret, {
      httpOnly: true,
      secure: c.req.url.startsWith("https"),
      sameSite: "Lax",
      maxAge: COOKIE_MAX_AGE,
      path: "/",
    });
  };
}

export function getSession(c: Context): UserSession {
  return c.get("session") as UserSession;
}

export function setProviderSession(c: Context, providerId: string, ps: ProviderSession) {
  const session = getSession(c);
  session.providers[providerId] = ps;
  c.set("session", session);
}

export function setWallet(c: Context, address: string) {
  const session = getSession(c);
  session.wallet = { address, linkedAt: Date.now() };
  c.set("session", session);
}

export function clearSession(c: Context) {
  c.set("session", { providers: {} });
}
