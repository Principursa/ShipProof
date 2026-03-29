import { env } from "@ShipProof/env/web";

const BASE = env.VITE_SERVER_URL;

export interface ProviderInfo {
  id: string;
  displayName: string;
}

export interface AuthStatus {
  connected: string[];
  providers: Record<string, { userId: string }>;
  wallet: string | null;
}

export interface AttestationEnvelope {
  meta: {
    identityHash: string;
    fromTs: string;
    toTs: string;
    metricCount: number;
    metricsVersion: number;
    scoringVersion: number;
    wallet: string;
    oracleNonce: string;
    expiresAt: string;
  };
  configs: Array<{ cap: number; weight: number }>;
  encryptedInputs: Array<{
    ctHash: string;
    securityZone: number;
    utype: number;
    signature: string;
  }>;
  signature: string;
}

export async function fetchProviders(): Promise<ProviderInfo[]> {
  const res = await fetch(`${BASE}/auth/providers`, { credentials: "include" });
  if (!res.ok) throw new Error("Failed to fetch providers");
  return res.json();
}

export async function fetchAuthStatus(): Promise<AuthStatus> {
  const res = await fetch(`${BASE}/auth/status`, { credentials: "include" });
  if (!res.ok) throw new Error("Failed to fetch auth status");
  return res.json();
}

export async function postAttest(): Promise<AttestationEnvelope> {
  const res = await fetch(`${BASE}/attest`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `Attestation failed: ${res.status}`);
  }
  return res.json();
}
