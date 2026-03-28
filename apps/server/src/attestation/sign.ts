import { privateKeyToAccount } from "viem/accounts";
import { keccak256, encodeAbiParameters, parseAbiParameters } from "viem";

export const ATTESTATION_TYPES = {
  Attestation: [
    { name: "identityHash", type: "bytes32" },
    { name: "fromTs", type: "uint64" },
    { name: "toTs", type: "uint64" },
    { name: "metricCount", type: "uint8" },
    { name: "metricsVersion", type: "uint32" },
    { name: "scoringVersion", type: "uint32" },
    { name: "wallet", type: "address" },
    { name: "oracleNonce", type: "uint64" },
    { name: "expiresAt", type: "uint64" },
    { name: "configHash", type: "bytes32" },
    { name: "ctInputsHash", type: "bytes32" },
  ],
} as const;

export const EIP712_DOMAIN = {
  name: "ShipProof",
  version: "1",
} as const;

export interface AttestationMeta {
  identityHash: `0x${string}`;
  fromTs: bigint;
  toTs: bigint;
  metricCount: number;
  metricsVersion: number;
  scoringVersion: number;
  wallet: `0x${string}`;
  oracleNonce: bigint;
  expiresAt: bigint;
}

export function hashConfigs(configs: Array<{ cap: number; weight: number }>): `0x${string}` {
  if (configs.length === 0) return keccak256("0x");
  const types = configs.map(() => "uint32, uint32").join(", ");
  const values = configs.flatMap((c) => [c.cap, c.weight]);
  return keccak256(
    encodeAbiParameters(parseAbiParameters(types), values as any),
  );
}

export async function signAttestation(
  privateKey: `0x${string}`,
  meta: AttestationMeta,
  configs: Array<{ cap: number; weight: number }>,
  ctInputsHash: `0x${string}`,
  chainId: number,
  contractAddress: `0x${string}`,
): Promise<`0x${string}`> {
  const account = privateKeyToAccount(privateKey);
  const configHash = hashConfigs(configs);

  const signature = await account.signTypedData({
    domain: {
      ...EIP712_DOMAIN,
      chainId,
      verifyingContract: contractAddress,
    },
    types: ATTESTATION_TYPES,
    primaryType: "Attestation",
    message: {
      identityHash: meta.identityHash,
      fromTs: meta.fromTs,
      toTs: meta.toTs,
      metricCount: meta.metricCount,
      metricsVersion: meta.metricsVersion,
      scoringVersion: meta.scoringVersion,
      wallet: meta.wallet,
      oracleNonce: meta.oracleNonce,
      expiresAt: meta.expiresAt,
      configHash,
      ctInputsHash,
    },
  });

  return signature;
}
