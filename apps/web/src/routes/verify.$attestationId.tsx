import { createFileRoute, Link } from "@tanstack/react-router";
import { useAccount, useSwitchChain } from "wagmi";
import { useReadContract } from "wagmi";
import { useCofheReadContractAndDecrypt } from "@cofhe/react";
import { arbitrumSepolia } from "wagmi/chains";
import { Button } from "@ShipProof/ui/components/button";
import { AlertCircle, Loader2 } from "lucide-react";
import {
  shipProofAbi,
  SHIPPROOF_ADDRESS,
  AttestationState,
} from "@/lib/contracts";
import { VerifyBadgeCard } from "@/components/verify-badge-card";
import { PermitGate } from "@/components/permit-gate";
import { ErrorBoundary } from "@/components/error-boundary";

export const Route = createFileRoute("/verify/$attestationId")({
  component: VerifyDetailPage,
});

function VerifyDetailPage() {
  const { attestationId } = Route.useParams();
  const id = attestationId as `0x${string}`;
  const { address, chainId, isConnected } = useAccount();
  const { switchChainAsync } = useSwitchChain();

  const { data: attestation, isLoading: attLoading } = useReadContract({
    address: SHIPPROOF_ADDRESS,
    abi: shipProofAbi,
    functionName: "attestations",
    args: [id],
  });

  const { data: stateRaw } = useReadContract({
    address: SHIPPROOF_ADDRESS,
    abi: shipProofAbi,
    functionName: "attestationState",
    args: [id],
  });

  const state = Number(stateRaw ?? 0);
  const isOnCorrectChain = chainId === arbitrumSepolia.id;

  // State X: Invalid attestation
  const isInvalid =
    !attLoading && (!attestation || state === AttestationState.None);

  // State Y: Not ready (score not computed yet)
  const isNotReady =
    !isInvalid && state > AttestationState.None && state < AttestationState.ScoreComputed;

  // Can we attempt decryption?
  const canAttemptDecrypt = isConnected && isOnCorrectChain && !isInvalid && !isNotReady;

  return (
    <div className="mx-auto w-full max-w-xl px-6 py-12 md:py-16">
      <div className="mb-10 animate-fade-up">
        <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.3em] text-primary">
          Verification Portal
        </p>
        <h1 className="font-serif text-4xl tracking-tight">
          Verify Attestation
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          View and decrypt a candidate's shared score.
        </p>
      </div>

      <div
        className="space-y-4 animate-fade-up"
        style={{ animationDelay: "100ms" }}
      >
        {/* State X: Invalid */}
        {isInvalid && !attLoading && (
          <div className="border border-dashed border-border p-8 text-center space-y-3">
            <AlertCircle className="mx-auto h-6 w-6 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              Attestation not found. This link may be invalid or the attestation
              may have been superseded.
            </p>
            <Link to="/verify">
              <Button
                variant="outline"
                className="font-mono text-[11px] uppercase tracking-[0.15em]"
              >
                Search by Wallet
              </Button>
            </Link>
          </div>
        )}

        {/* State Y: Not ready */}
        {isNotReady && (
          <div className="border border-dashed border-border p-8 text-center space-y-3">
            <p className="text-sm text-muted-foreground">
              This attestation is still being processed. The candidate hasn't
              completed scoring yet.
            </p>
          </div>
        )}

        {/* Badge card (shows for all valid states) */}
        {!isInvalid && !isNotReady && (
          <ErrorBoundary>
            <VerifyBadgeCard
              attestationId={id}
              attemptDecrypt={canAttemptDecrypt}
            />

            {/* State A: Not connected */}
            {!isConnected && (
              <div className="border border-dashed border-border p-5 text-center space-y-2">
                <p className="font-mono text-[11px] text-muted-foreground">
                  Connect your wallet to check if this score has been shared
                  with you.
                </p>
              </div>
            )}

            {/* State B: Wrong chain */}
            {isConnected && !isOnCorrectChain && (
              <div className="border border-dashed border-border p-5 text-center space-y-3">
                <p className="font-mono text-[11px] text-muted-foreground">
                  Please switch to Arbitrum Sepolia to verify this attestation.
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    switchChainAsync({ chainId: arbitrumSepolia.id })
                  }
                  className="font-mono text-[10px] uppercase tracking-[0.15em]"
                >
                  Switch Chain
                </Button>
              </div>
            )}

            {/* State C: Need permit — PermitGate handles missing/expired */}
            {isConnected && isOnCorrectChain && (
              <PermitGate action="verifying this attestation">
                {/* State D/E: PermitGate children render when permit is ready */}
                {/* VerifyBadgeCard handles decryption and shows score or "No access" */}
                <VerifyDetailStatus attestationId={id} />
              </PermitGate>
            )}
          </ErrorBoundary>
        )}
      </div>
    </div>
  );
}

/**
 * Subcomponent rendered inside PermitGate (only when permit is active).
 * Distinguishes State D (no access) from State E (access granted) and handles errors.
 */
function VerifyDetailStatus({ attestationId }: { attestationId: `0x${string}` }) {
  const { address } = useAccount();
  const {
    decrypted: decryptedScore,
  } = useCofheReadContractAndDecrypt({
    address: SHIPPROOF_ADDRESS,
    abi: shipProofAbi,
    functionName: "getEncScore",
    args: [attestationId],
  });

  // Error state — RPC/coprocessor failure, NOT access denial
  if (decryptedScore.isError) {
    return (
      <div className="border border-destructive/20 bg-destructive/5 p-4 space-y-2">
        <p className="font-mono text-[11px] text-destructive">
          Something went wrong verifying this attestation. Please try again.
        </p>
        <Button
          size="xs"
          variant="outline"
          onClick={() => decryptedScore.refetch()}
          className="font-mono text-[10px] uppercase tracking-[0.15em]"
        >
          Retry
        </Button>
      </div>
    );
  }

  // Loading
  if (decryptedScore.isLoading) {
    return (
      <div className="border border-border/50 p-4 text-center">
        <Loader2 className="mx-auto h-4 w-4 animate-spin text-muted-foreground" />
        <p className="mt-2 font-mono text-[10px] text-muted-foreground">
          Checking access...
        </p>
      </div>
    );
  }

  // State E: Access granted — score is shown in the VerifyBadgeCard above
  if (decryptedScore.data != null) {
    return (
      <div className="border border-primary/10 bg-accent/20 p-4">
        <p className="font-mono text-[10px] text-primary">
          Score decrypted successfully. See results above.
        </p>
      </div>
    );
  }

  // State D: No access granted
  return (
    <div className="border border-dashed border-border p-5 space-y-3">
      <p className="text-sm text-muted-foreground">
        This candidate hasn't shared their score with your wallet yet.
      </p>
      <p className="font-mono text-[10px] text-muted-foreground">
        Send them your wallet address so they can grant you access:
      </p>
      {address && (
        <code className="block rounded bg-muted px-3 py-2 font-mono text-xs break-all">
          {address}
        </code>
      )}
      <Link to="/" className="inline-block">
        <Button
          variant="link"
          size="xs"
          className="font-mono text-[10px] uppercase tracking-[0.15em] px-0"
        >
          Learn how ShipProof works
        </Button>
      </Link>
    </div>
  );
}
