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

  if (isLoading) return <Skeleton className="h-52 w-full" />;

  if (!attestation) {
    return (
      <Card>
        <CardContent className="p-8 text-center">
          <span className="text-sm text-muted-foreground">Attestation not found.</span>
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
    <Card className="stamp-border overflow-hidden">
      <CardContent className="p-0">
        {/* Header band */}
        <div className="flex items-center justify-between border-b border-border/50 bg-accent/30 px-5 py-3">
          <div className="flex items-center gap-3">
            <img src="/logo.png" alt="" className="h-7 w-auto" />
            <span className="font-serif text-base tracking-tight">ShipProof Badge</span>
          </div>
          {isMinted && (
            <span className="bg-primary px-2.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.2em] text-primary-foreground">
              Minted
            </span>
          )}
        </div>

        {/* Data rows */}
        <div className="divide-y divide-border/30 px-5">
          <DataRow label="Period" value={`${fromDate} — ${toDate}`} />
          <DataRow label="Metrics" value={`${metricCount} encrypted (v${metricsVersion})`} />
          <DataRow label="Wallet" value={truncatedWallet} mono />
          <DataRow label="Attestation" value={`${attestationId.slice(0, 10)}…${attestationId.slice(-6)}`} mono />
        </div>
      </CardContent>
    </Card>
  );
}

function DataRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between py-3">
      <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">{label}</span>
      <span className={`text-sm ${mono ? "font-mono text-xs" : ""}`}>{value}</span>
    </div>
  );
}
