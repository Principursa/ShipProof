import { createFileRoute, Link } from "@tanstack/react-router";
import { useAccount, useSwitchChain } from "wagmi";
import { useReadContract } from "wagmi";
import { arbitrumSepolia } from "wagmi/chains";
import { Button } from "@ShipProof/ui/components/button";
import { AlertCircle } from "lucide-react";
import {
  shipProofAbi,
  SHIPPROOF_ADDRESS,
  AttestationState,
} from "@/lib/contracts";
import { VerifyBadgeCard } from "@/components/verify-badge-card";

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
          View a candidate's badge details.
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
          <>
            <VerifyBadgeCard attestationId={id} />

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

            {/* Connected + correct chain — show access info */}
            {isConnected && isOnCorrectChain && (
              <div className="border border-dashed border-border p-5 space-y-3">
                <p className="text-sm text-muted-foreground">
                  Score decryption requires the candidate to grant your wallet access.
                </p>
                <p className="font-mono text-[10px] text-muted-foreground">
                  Share your wallet address with the candidate:
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
            )}
          </>
        )}
      </div>
    </div>
  );
}
