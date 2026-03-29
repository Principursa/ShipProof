import { describe, test, expect } from "bun:test";
import { signAttestation, ATTESTATION_TYPES, EIP712_DOMAIN, hashConfigs } from "../../src/attestation/sign";
import { privateKeyToAccount } from "viem/accounts";
import { verifyTypedData, keccak256, encodePacked } from "viem";

const TEST_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80" as const;
const account = privateKeyToAccount(TEST_KEY);

describe("signAttestation", () => {
  test("produces a recoverable EIP-712 signature", async () => {
    const meta = {
      identityHash: keccak256(encodePacked(["string"], ["test_identity"])),
      fromTs: BigInt(1700000000),
      toTs: BigInt(1700100000),
      metricCount: 1,
      metricsVersion: 1,
      scoringVersion: 1,
      wallet: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8" as `0x${string}`,
      oracleNonce: BigInt(1),
      expiresAt: BigInt(1700200000),
    };

    const configs = [{ cap: 100, weight: 10000 }];
    const ctInputsHash = keccak256(encodePacked(["string"], ["test_ct_inputs"]));
    const chainId = 421614;
    const contractAddress = "0x1234567890123456789012345678901234567890" as `0x${string}`;

    const signature = await signAttestation(TEST_KEY, meta, configs, ctInputsHash, chainId, contractAddress);
    expect(signature).toMatch(/^0x[0-9a-f]{130}$/);

    const configHash = hashConfigs(configs);
    const valid = await verifyTypedData({
      address: account.address,
      domain: { ...EIP712_DOMAIN, chainId, verifyingContract: contractAddress },
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
      signature,
    });
    expect(valid).toBe(true);
  });
});
