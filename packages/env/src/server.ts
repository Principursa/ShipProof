import "dotenv/config";
import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

export const env = createEnv({
  server: {
    CORS_ORIGIN: z.url(),
    NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
    ORACLE_PRIVATE_KEY: z.string().min(1).optional(),
    ARB_SEPOLIA_RPC_URL: z.string().url().optional(),
    IDENTITY_SALT: z.string().min(16).optional(),
    GITHUB_CLIENT_ID: z.string().min(1).optional(),
    GITHUB_CLIENT_SECRET: z.string().min(1).optional(),
    X_CLIENT_ID: z.string().min(1).optional(),
    X_CLIENT_SECRET: z.string().min(1).optional(),
  },
  runtimeEnv: process.env,
  emptyStringAsUndefined: true,
});
