import { keccak256, encodePacked } from "viem";
import { getProvider } from "../providers/registry";
import type { ProviderSession } from "../session";
import type { RawMetric } from "../providers/types";
import { encryptMetrics, computeSchemaVersion } from "./encrypt";
import { signAttestation, type AttestationMeta } from "./sign";

const CURRENT_SCORING_VERSION = 1;
const ENVELOPE_TTL = 300; // 5 minutes

let nonceCounter = 0;

export function buildIdentityHash(
  salt: string,
  providerUserIds: Record<string, string>,
): `0x${string}` {
  const sorted = Object.entries(providerUserIds)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([id, userId]) => `${id}:${userId}`);
  return keccak256(encodePacked(["string", "string"], [salt, sorted.join(",")]));
}

export async function collectMetrics(
  sessions: Record<string, ProviderSession>,
  window: { from: Date; to: Date },
): Promise<RawMetric[]> {
  const allMetrics: RawMetric[] = [];

  for (const [providerId, session] of Object.entries(sessions)) {
    const provider = getProvider(providerId);
    const result = await provider.fetchMetrics(session.tokens, session.userId, window);
    allMetrics.push(...result.metrics);
  }

  // Canonical sort by key
  allMetrics.sort((a, b) => a.key.localeCompare(b.key));
  return allMetrics;
}

export interface AttestationEnvelope {
  meta: AttestationMeta;
  configs: Array<{ cap: number; weight: number }>;
  encryptedInputs: unknown[];
  signature: `0x${string}`;
}

export async function buildAttestation(
  sessions: Record<string, ProviderSession>,
  wallet: `0x${string}`,
  identitySalt: string,
  oraclePrivateKey: `0x${string}`,
  chainId: number,
  contractAddress: `0x${string}`,
  window: { from: Date; to: Date },
): Promise<AttestationEnvelope> {
  // 1. Collect metrics from all connected providers
  const allMetrics = await collectMetrics(sessions, window);
  if (allMetrics.length === 0) throw new Error("No metrics collected");

  // 2. Build identity hash
  const providerUserIds: Record<string, string> = {};
  for (const [providerId, session] of Object.entries(sessions)) {
    providerUserIds[providerId] = session.userId;
  }
  const identityHash = buildIdentityHash(identitySalt, providerUserIds);

  // 3. Encrypt metrics
  const { encryptedInputs, ctInputsHash } = await encryptMetrics(
    allMetrics.map((m) => m.value),
  );

  // 4. Build configs
  const configs = allMetrics.map((m) => ({ cap: m.cap, weight: m.weight }));

  // 5. Compute metricsVersion
  const metricsVersion = computeSchemaVersion(allMetrics.map((m) => m.key));

  // 6. Build and sign envelope
  const now = Math.floor(Date.now() / 1000);
  const meta: AttestationMeta = {
    identityHash,
    fromTs: BigInt(Math.floor(window.from.getTime() / 1000)),
    toTs: BigInt(Math.floor(window.to.getTime() / 1000)),
    metricCount: allMetrics.length,
    metricsVersion,
    scoringVersion: CURRENT_SCORING_VERSION,
    wallet,
    oracleNonce: BigInt(++nonceCounter),
    expiresAt: BigInt(now + ENVELOPE_TTL),
  };

  const signature = await signAttestation(
    oraclePrivateKey,
    meta,
    configs,
    ctInputsHash,
    chainId,
    contractAddress,
  );

  return { meta, configs, encryptedInputs, signature };
}
