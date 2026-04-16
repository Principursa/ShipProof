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
    <div className="mx-auto w-full max-w-xl px-6 py-10">
      <div className="mb-8">
        <h1 className="font-mono text-2xl font-bold tracking-tight">Badge</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          View your attestation proof and manage selective disclosure.
        </p>
      </div>

      <div className="space-y-5">
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
