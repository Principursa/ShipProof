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

  // metricCount is index 3 in the tuple
  const metricCount = attestation ? Number((attestation as unknown as any[])[3]) : 0;

  return (
    <div className="container mx-auto max-w-xl px-4 py-6 space-y-6">
      <h1 className="text-2xl font-bold">ShipProof Badge</h1>
      <BadgeDisplay attestationId={attestationId} />
      {metricCount > 0 && (
        <SelectiveDisclosure
          attestationId={attestationId}
          metricCount={metricCount}
        />
      )}
    </div>
  );
}
