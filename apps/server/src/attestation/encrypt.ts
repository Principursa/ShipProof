import { keccak256, encodeAbiParameters, parseAbiParameters } from "viem";

/**
 * Compute metricsVersion from sorted metric keys.
 * Returns first 4 bytes of keccak256(sorted keys joined by comma) as uint32.
 */
export function computeSchemaVersion(keys: string[]): number {
  const hash = keccak256(
    encodeAbiParameters(parseAbiParameters("string"), [keys.sort().join(",")]),
  );
  return parseInt(hash.slice(0, 10), 16); // "0x" + 8 hex chars = 4 bytes
}

/**
 * Encrypt metric values using cofhejs.
 * Returns the encrypted inputs and a hash of the raw ciphertext inputs
 * (for inclusion in the EIP-712 signature).
 *
 * NOTE: cofhejs requires initialization with a provider and signer
 * before calling encrypt(). The pipeline must call cofhejs.initialize()
 * once at server startup.
 */
export async function encryptMetrics(
  values: number[],
): Promise<{ encryptedInputs: unknown[]; ctInputsHash: `0x${string}` }> {
  const { cofhejs, Encryptable } = await import("cofhejs/node");

  const result = await cofhejs.encrypt(
    values.map((v) => Encryptable.uint32(BigInt(v))),
  );

  if (!result.success) {
    throw new Error(`CoFHE encryption failed: ${(result as any).error}`);
  }

  const encryptedInputs = result.data as unknown[];

  // Hash the encrypted inputs for the EIP-712 signature
  // Serialize each input to bytes and hash
  const serialized = encryptedInputs.map((inp) =>
    Buffer.from(JSON.stringify(inp)),
  );
  const concatenated = Buffer.concat(serialized);
  const ctInputsHash = keccak256(`0x${concatenated.toString("hex")}` as `0x${string}`);

  return { encryptedInputs, ctInputsHash };
}
