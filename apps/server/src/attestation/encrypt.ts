import { keccak256, encodeAbiParameters, concatHex } from "viem";

/**
 * Compute metricsVersion from sorted metric keys.
 * Returns first 4 bytes of keccak256(sorted keys joined by comma) as uint32.
 */
export function computeSchemaVersion(keys: string[]): number {
  const hash = keccak256(
    encodeAbiParameters([{ type: "string" }], [keys.sort().join(",")]),
  );
  return parseInt(hash.slice(0, 10), 16); // "0x" + 8 hex chars = 4 bytes
}

/**
 * Hash encrypted inputs to match the contract's _hashCtInputs.
 *
 * The contract does:
 *   for each input: packed = abi.encodePacked(packed, abi.encode(inputs[i]))
 *   return keccak256(packed)
 *
 * InEuint32 is: { uint256 ctHash, uint8 securityZone, uint8 utype, bytes signature }
 * abi.encode of a struct with dynamic `bytes` produces ABI-encoded tuple.
 */
export function hashCtInputs(encryptedInputs: InEuint32Like[]): `0x${string}` {
  if (encryptedInputs.length === 0) return keccak256("0x");

  const encodedParts = encryptedInputs.map((inp) =>
    encodeAbiParameters(
      [
        { type: "uint256" },
        { type: "uint8" },
        { type: "uint8" },
        { type: "bytes" },
      ],
      [
        BigInt(inp.ctHash),
        inp.securityZone,
        inp.utype,
        inp.signature as `0x${string}`,
      ],
    ),
  );

  return keccak256(concatHex(encodedParts));
}

/** Shape of @cofhe/sdk EncryptedItemInput output */
export interface InEuint32Like {
  ctHash: string | bigint;
  securityZone: number;
  utype: number;
  signature: string;
}

/**
 * Encrypt metric values using @cofhe/sdk.
 * Returns the encrypted inputs and a hash matching the contract's _hashCtInputs.
 *
 * IMPORTANT: The CofheClient must be initialized and connected before calling this.
 */
export async function encryptMetrics(
  values: number[],
): Promise<{ encryptedInputs: InEuint32Like[]; ctInputsHash: `0x${string}` }> {
  const { Encryptable } = await import("@cofhe/sdk");
  const client = (globalThis as any).__cofheClient;
  if (!client) {
    throw new Error("CofheClient not initialized — is ARB_SEPOLIA_RPC_URL set?");
  }

  const items = values.map((v) => Encryptable.uint32(BigInt(v)));
  const encrypted = await client.encryptInputs(items).execute();

  const encryptedInputs = encrypted as unknown as InEuint32Like[];
  const ctInputsHash = hashCtInputs(encryptedInputs);

  return { encryptedInputs, ctInputsHash };
}
