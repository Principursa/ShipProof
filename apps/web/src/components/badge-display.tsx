import { useReadContract } from "wagmi";
import { Card, CardContent } from "@ShipProof/ui/components/card";
import { Skeleton } from "@ShipProof/ui/components/skeleton";
import { shipProofAbi, SHIPPROOF_ADDRESS } from "@/lib/contracts";

interface BadgeDisplayProps {
  attestationId: `0x${string}`;
}

export function BadgeDisplay({ attestationId }: BadgeDisplayProps) {
  const { data: attestation, isLoading } = useReadContract({
    address: SHIPPROOF_ADDRESS,
    abi: shipProofAbi,
    functionName: "attestations",
    args: [attestationId],
  });

  const { data: isMinted } = useReadContract({
    address: SHIPPROOF_ADDRESS,
    abi: shipProofAbi,
    functionName: "badgeMinted",
    args: [attestationId],
  });

  if (isLoading) {
    return <Skeleton className="h-48 w-full" />;
  }

  if (!attestation) {
    return (
      <Card>
        <CardContent className="p-6 text-center">
          <span className="font-mono text-xs text-muted-foreground">Attestation not found.</span>
        </CardContent>
      </Card>
    );
  }

  const [, fromTs, toTs, metricCount, metricsVersion, , wallet] = attestation as [
    string, bigint, bigint, number, number, number, string, bigint, bigint,
  ];

  const fromDate = new Date(Number(fromTs) * 1000).toLocaleDateString();
  const toDate = new Date(Number(toTs) * 1000).toLocaleDateString();
  const truncatedWallet = `${wallet.slice(0, 6)}…${wallet.slice(-4)}`;

  return (
    <Card>
      <CardContent className="p-5">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src="/logo.png" alt="" className="h-8 w-auto opacity-80" />
            <span className="font-mono text-sm font-bold tracking-tight">ShipProof Badge</span>
          </div>
          {isMinted && (
            <span className="border border-primary/30 bg-accent/50 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-primary">
              Minted
            </span>
          )}
        </div>

        <div className="space-y-2 border-t border-border/60 pt-3">
          <Row label="Period" value={`${fromDate} — ${toDate}`} />
          <Row label="Metrics" value={`${metricCount} metrics (v${metricsVersion})`} />
          <Row label="Wallet" value={truncatedWallet} mono />
        </div>
      </CardContent>
    </Card>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex justify-between text-xs">
      <span className="text-muted-foreground">{label}</span>
      <span className={mono ? "font-mono" : ""}>{value}</span>
    </div>
  );
}
