import { Hono } from "hono";
import { verifyMessage } from "viem";
import { getSession, setWallet } from "../session";
import { sessionMiddleware } from "../session";

/**
 * Build the linking message from connected provider sessions.
 * Format: "Link github:userId1, x:userId2 to wallet:0x... nonce:123"
 * Uses userId (stable provider ID), not username.
 */
export function buildLinkingMessage(
  providers: Record<string, { userId: string }>,
  walletAddress: string,
  nonce: string,
): string {
  const parts = Object.entries(providers)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([id, s]) => `${id}:${s.userId}`);
  return `Link ${parts.join(", ")} to wallet:${walletAddress} nonce:${nonce}`;
}

export function createWalletRouter(sessionSecret: string) {
  const wallet = new Hono();

  wallet.use("/*", sessionMiddleware(sessionSecret));

  wallet.post("/link-wallet", async (c) => {
    const session = getSession(c);
    const connectedProviders = Object.keys(session.providers);
    if (connectedProviders.length === 0) {
      return c.json({ error: "No providers connected" }, 400);
    }

    const body = await c.req.json<{
      wallet: `0x${string}`;
      signature: `0x${string}`;
      nonce: string;
    }>();

    const message = buildLinkingMessage(session.providers, body.wallet, body.nonce);

    const valid = await verifyMessage({
      address: body.wallet,
      message,
      signature: body.signature,
    });

    if (!valid) {
      return c.json({ error: "Invalid signature" }, 403);
    }

    setWallet(c, body.wallet);
    return c.json({ success: true, wallet: body.wallet });
  });

  return wallet;
}
