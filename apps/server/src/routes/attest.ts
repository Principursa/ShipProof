import { Hono } from "hono";
import { sessionMiddleware, getSession } from "../session";
import { buildAttestation } from "../attestation/pipeline";

export function createAttestRouter(
  sessionSecret: string,
  oraclePrivateKey: `0x${string}`,
  identitySalt: string,
  chainId: number,
  contractAddress: `0x${string}`,
) {
  const attest = new Hono();

  attest.use("/*", sessionMiddleware(sessionSecret));

  attest.post("/", async (c) => {
    const session = getSession(c);

    if (!session.wallet) {
      return c.json({ error: "Wallet not linked" }, 400);
    }

    const connectedProviders = Object.keys(session.providers);
    if (connectedProviders.length === 0) {
      return c.json({ error: "No providers connected" }, 400);
    }

    // Default window: last 90 days
    const body = await c.req.json<{
      fromTs?: number;
      toTs?: number;
    }>().catch(() => ({ fromTs: undefined, toTs: undefined }));

    const now = Math.floor(Date.now() / 1000);
    const window = {
      from: new Date((body.fromTs ?? now - 90 * 86400) * 1000),
      to: new Date((body.toTs ?? now) * 1000),
    };

    const envelope = await buildAttestation(
      session.providers,
      session.wallet.address as `0x${string}`,
      identitySalt,
      oraclePrivateKey,
      chainId,
      contractAddress,
      window,
    );

    // Serialize bigints for JSON response
    return c.json({
      meta: {
        ...envelope.meta,
        fromTs: envelope.meta.fromTs.toString(),
        toTs: envelope.meta.toTs.toString(),
        oracleNonce: envelope.meta.oracleNonce.toString(),
        expiresAt: envelope.meta.expiresAt.toString(),
      },
      configs: envelope.configs,
      encryptedInputs: envelope.encryptedInputs,
      signature: envelope.signature,
    });
  });

  // Schema lookup
  attest.get("/schema/:version", (c) => {
    return c.json({
      version: c.req.param("version"),
      note: "Schema endpoint — will serve metricsVersion to slot key mapping",
    });
  });

  return attest;
}
