import { Hono } from "hono";
import { getProvider, getAllProviders } from "../providers/registry";
import { sessionMiddleware, getSession, setProviderSession, type SessionEnv } from "../session";
import { randomBytes } from "crypto";

export function createAuthRouter(baseUrl: string, sessionSecret: string, frontendUrl: string) {
  const auth = new Hono<SessionEnv>();

  auth.use("/*", sessionMiddleware(sessionSecret));

  // List available providers
  auth.get("/providers", (c) => {
    return c.json(
      getAllProviders().map((p) => ({
        id: p.id,
        displayName: p.displayName,
      })),
    );
  });

  // Current session status
  auth.get("/status", (c) => {
    const session = getSession(c);
    const providers: Record<string, { userId: string }> = {};
    for (const [id, ps] of Object.entries(session.providers)) {
      providers[id] = { userId: ps.userId };
    }
    return c.json({
      connected: Object.keys(session.providers),
      providers,
      wallet: session.wallet?.address ?? null,
    });
  });

  // Handle OAuth callback (must be before /:providerId to avoid collision)
  auth.get("/:providerId/callback", async (c) => {
    const providerId = c.req.param("providerId");
    const provider = getProvider(providerId);
    const code = c.req.query("code");
    const state = c.req.query("state");

    if (!code) return c.json({ error: "Missing code" }, 400);

    const session = getSession(c);
    if (!state || state !== session.csrfToken) {
      return c.json({ error: "Invalid state" }, 403);
    }

    const redirectUri = `${baseUrl}/auth/${provider.id}/callback`;
    const tokens = await provider.exchangeCode(code, redirectUri, session.pkceVerifier);
    delete session.pkceVerifier;
    const userId = await provider.getUserId(tokens);
    setProviderSession(c, provider.id, { tokens, userId });

    return c.redirect(`${frontendUrl}/attest`);
  });

  // Initiate OAuth for any provider
  auth.get("/:providerId", (c) => {
    const providerId = c.req.param("providerId");
    const provider = getProvider(providerId);
    const state = randomBytes(16).toString("hex");
    const session = getSession(c);
    session.csrfToken = state;
    const redirectUri = `${baseUrl}/auth/${provider.id}/callback`;
    const authResult = provider.getAuthUrl(state, redirectUri);
    if (typeof authResult === "string") {
      c.set("session", session);
      return c.redirect(authResult);
    }
    session.pkceVerifier = authResult.pkceVerifier;
    c.set("session", session);
    return c.redirect(authResult.url);
  });

  // Clear session (used when wallet changes)
  auth.post("/logout", (c) => {
    const session = getSession(c);
    session.providers = {};
    delete session.wallet;
    c.set("session", session);
    return c.json({ ok: true });
  });

  return auth;
}
