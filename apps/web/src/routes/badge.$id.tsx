import { createFileRoute } from "@tanstack/react-router";
import { BadgeDisplay } from "@/components/badge-display";
import { SelectiveDisclosure } from "@/components/selective-disclosure";
import { useReadContract } from "wagmi";
import { shipProofAbi, SHIPPROOF_ADDRESS } from "@/lib/contracts";

export const Route = createFileRoute("/badge/$id")({
  component: BadgePage,
});

function BadgePage() {
  const { id } = Route.useParams();
  const attestationId = id as `0x${string}`;

  const { data: attestation } = useReadContract({
    address: SHIPPROOF_ADDRESS,
    abi: shipProofAbi,
    functionName: "attestations",
    args: [attestationId],
  });

  const metricCount = attestation ? Number((attestation as unknown as any[])[3]) : 0;

  return (
    <div className="mx-auto w-full max-w-xl px-6 py-12 md:py-16">
      <div className="mb-10 animate-fade-up">
        <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.3em] text-primary">
          On-chain Proof
        </p>
        <h1 className="font-serif text-4xl tracking-tight">Badge</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          View your attestation and manage selective disclosure.
        </p>
      </div>

      <div className="space-y-4 animate-fade-up" style={{ animationDelay: "100ms" }}>
        <BadgeDisplay attestationId={attestationId} />
        {metricCount > 0 && (
          <SelectiveDisclosure
            attestationId={attestationId}
            metricCount={metricCount}
          />
        )}
      </div>
    </div>
  );
}
