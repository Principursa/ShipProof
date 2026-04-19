import { useEffect, useState } from "react";
import { useCofheActivePermit, useCofheClient } from "@cofhe/react";
import { useReadContract } from "wagmi";
import { SHIPPROOF_ADDRESS, shipProofAbi } from "@/lib/contracts";

interface UseDecryptScoreResult {
  data: number | null;
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
}

const IDLE_RESULT: UseDecryptScoreResult = {
  data: null,
  isLoading: false,
  isError: false,
  error: null,
};
const EMPTY_HANDLE =
  "0x0000000000000000000000000000000000000000000000000000000000000000";

function toError(error: unknown, fallback: string): Error {
  if (error instanceof Error) return error;
  if (typeof error === "string" && error.length > 0) return new Error(error);
  return new Error(fallback);
}

export function useDecryptScore(
  attestationId: string,
  enabled: boolean,
): UseDecryptScoreResult {
  const cofheClient = useCofheClient();
  const activePermit = useCofheActivePermit();
  const hasActivePermit = Boolean(activePermit?.permit && activePermit.isValid);
  const permitHash = hasActivePermit ? (activePermit?.permit.hash ?? null) : null;

  const {
    data: handle,
    error: handleError,
    isLoading: isHandleLoading,
  } = useReadContract({
    address: SHIPPROOF_ADDRESS,
    abi: shipProofAbi,
    functionName: "getEncScore",
    args: [attestationId as `0x${string}`],
    query: {
      enabled,
    },
  });

  const [result, setResult] = useState<UseDecryptScoreResult>(IDLE_RESULT);

  useEffect(() => {
    if (!enabled) {
      setResult(IDLE_RESULT);
      return;
    }

    if (handleError) {
      setResult({
        data: null,
        isLoading: false,
        isError: true,
        error: toError(handleError, "Failed to read encrypted score"),
      });
      return;
    }

    if (isHandleLoading) {
      setResult((current) => ({
        data: current.data,
        isLoading: true,
        isError: false,
        error: null,
      }));
      return;
    }

    if (!hasActivePermit || !permitHash) {
      setResult({
        data: null,
        isLoading: false,
        isError: true,
        error: new Error("Active CoFHE permit required to decrypt score"),
      });
      return;
    }

    if (!handle || handle === EMPTY_HANDLE) {
      setResult({
        data: null,
        isLoading: false,
        isError: true,
        error: new Error("Encrypted score not available"),
      });
      return;
    }

    let cancelled = false;

    setResult((current) => ({
      data: current.data,
      isLoading: true,
      isError: false,
      error: null,
    }));

    const decrypt = async () => {
      try {
        const response = await cofheClient
          .decryptForTx(handle as string)
          .withPermit(permitHash)
          .execute();

        if (cancelled) return;

        const decryptedValue = Number(response.decryptedValue);
        if (!Number.isFinite(decryptedValue)) {
          throw new Error("Decrypted score is not a valid number");
        }

        setResult({
          data: decryptedValue,
          isLoading: false,
          isError: false,
          error: null,
        });
      } catch (error) {
        if (cancelled) return;

        setResult({
          data: null,
          isLoading: false,
          isError: true,
          error: toError(error, "Failed to decrypt score"),
        });
      }
    };

    void decrypt();

    return () => {
      cancelled = true;
    };
  }, [
    cofheClient,
    enabled,
    handle,
    handleError,
    hasActivePermit,
    isHandleLoading,
    permitHash,
  ]);

  return result;
}
