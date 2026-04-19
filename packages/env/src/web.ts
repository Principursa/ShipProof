import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

export const env = createEnv({
  clientPrefix: "VITE_",
  client: {
    VITE_SERVER_URL: z.url(),
    VITE_SHIPPROOF_CONTRACT_ADDRESS: z.string().startsWith("0x").length(42).optional(),
    VITE_ARB_SEPOLIA_RPC_URL: z.string().url().optional(),
    VITE_DEPLOY_BLOCK: z.string().regex(/^\d+$/).optional(),
  },
  runtimeEnv: (import.meta as any).env,
  emptyStringAsUndefined: true,
});
