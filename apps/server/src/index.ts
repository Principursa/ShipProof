import { env } from "@ShipProof/env/server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { registerProvider } from "./providers/registry";
import { GitHubProvider } from "./providers/github";
import { XProvider } from "./providers/x";
import { createAuthRouter } from "./routes/auth";
import { createWalletRouter } from "./auth/wallet";
import { createAttestRouter } from "./routes/attest";

// Register available providers (only if credentials are configured)
if (env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET) {
  registerProvider(new GitHubProvider(env.GITHUB_CLIENT_ID, env.GITHUB_CLIENT_SECRET));
}
if (env.X_CLIENT_ID && env.X_CLIENT_SECRET) {
  registerProvider(new XProvider(env.X_CLIENT_ID, env.X_CLIENT_SECRET));
}

const app = new Hono();

app.use(logger());
app.use(
  "/*",
  cors({
    origin: env.CORS_ORIGIN,
    allowMethods: ["GET", "POST", "OPTIONS"],
    credentials: true,
  }),
);

// Routes
app.route("/auth", createAuthRouter(env.BASE_URL, env.SESSION_SECRET));
app.route("/auth", createWalletRouter(env.SESSION_SECRET));
app.route("/attest", createAttestRouter(
  env.SESSION_SECRET,
  env.ORACLE_PRIVATE_KEY as `0x${string}`,
  env.IDENTITY_SALT,
  env.CHAIN_ID,
  (env.SHIPPROOF_CONTRACT_ADDRESS ?? "0x0000000000000000000000000000000000000000") as `0x${string}`,
));

// Health check
app.get("/health", (c) => c.json({ status: "ok" }));

export default app;
