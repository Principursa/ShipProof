import type { TierInfo } from "./tier";

export interface VerificationReceipt {
  type: "ShipProofVerification";
  version: 1;
  attestationId: string;
  candidateWallet: string;
  verifierWallet: string;
  tier: string;
  scoreAboveThreshold: boolean;
  attestationPeriod: { from: number; to: number };
  verifiedAt: string;
}

/**
 * Build the canonical receipt payload.
 * Keys MUST be in this exact order for deterministic serialization.
 */
export function buildReceiptPayload(params: {
  attestationId: string;
  candidateWallet: string;
  verifierWallet: string;
  score: number;
  tier: TierInfo;
  fromTs: number;
  toTs: number;
}): VerificationReceipt {
  return {
    type: "ShipProofVerification",
    version: 1,
    attestationId: params.attestationId,
    candidateWallet: params.candidateWallet,
    verifierWallet: params.verifierWallet,
    tier: params.tier.label,
    scoreAboveThreshold: params.score >= 4000, // matches contract THRESHOLD
    attestationPeriod: { from: params.fromTs, to: params.toTs },
    verifiedAt: new Date().toISOString(),
  };
}

/**
 * Canonical serialization — deterministic JSON string.
 * Must match the exact key order defined in the spec.
 */
export function canonicalize(receipt: VerificationReceipt): string {
  return JSON.stringify(receipt);
}

/**
 * Trigger download of the signed receipt as a .json file.
 */
export function downloadReceipt(
  receipt: VerificationReceipt,
  signature: string,
  signedBy: string,
) {
  const bundle = { receipt, signature, signedBy };
  const blob = new Blob([JSON.stringify(bundle, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `shipproof-receipt-${receipt.attestationId.slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}
