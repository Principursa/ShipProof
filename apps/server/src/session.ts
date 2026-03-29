import type { Context, MiddlewareHandler } from "hono";
import { getSignedCookie, setSignedCookie } from "hono/cookie";
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
  pkceVerifier?: string;
}

// Hono env type for typed c.set/c.get
export type SessionEnv = {
  Variables: {
    session: UserSession;
  };
};

const COOKIE_NAME = "shipproof_session";
const COOKIE_MAX_AGE = 60 * 60; // 1 hour

export function sessionMiddleware(secret: string): MiddlewareHandler<SessionEnv> {
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
    const updated = c.get("session");
    await setSignedCookie(c, COOKIE_NAME, JSON.stringify(updated), secret, {
      httpOnly: true,
      secure: c.req.url.startsWith("https"),
      sameSite: "Lax",
      maxAge: COOKIE_MAX_AGE,
      path: "/",
    });
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getSession(c: Context<any>): UserSession {
  return c.get("session") as UserSession;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function setProviderSession(c: Context<any>, providerId: string, ps: ProviderSession) {
  const session = getSession(c);
  session.providers[providerId] = ps;
  c.set("session", session);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function setWallet(c: Context<any>, address: string) {
  const session = getSession(c);
  session.wallet = { address, linkedAt: Date.now() };
  c.set("session", session);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function clearSession(c: Context<any>) {
  c.set("session", { providers: {} });
}
