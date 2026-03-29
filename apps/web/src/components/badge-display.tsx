import { useReadContract } from "wagmi";
import { Card, CardContent, CardHeader, CardTitle } from "@ShipProof/ui/components/card";
import { Skeleton } from "@ShipProof/ui/components/skeleton";
import { Shield } from "lucide-react";
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
        <CardContent className="p-6 text-center text-muted-foreground">
          Attestation not found.
        </CardContent>
      </Card>
    );
  }

  // attestations returns a tuple: [identityHash, fromTs, toTs, metricCount, metricsVersion, scoringVersion, wallet, oracleNonce, expiresAt]
  const [, fromTs, toTs, metricCount, metricsVersion, , wallet] = attestation as [
    string, bigint, bigint, number, number, number, string, bigint, bigint,
  ];

  const fromDate = new Date(Number(fromTs) * 1000).toLocaleDateString();
  const toDate = new Date(Number(toTs) * 1000).toLocaleDateString();
  const truncatedWallet = `${wallet.slice(0, 6)}...${wallet.slice(-4)}`;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Shield className="h-5 w-5 text-primary" />
          ShipProof Badge
          {isMinted && (
            <span className="ml-auto text-xs bg-green-500/10 text-green-500 px-2 py-0.5 rounded-full">
              Minted
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        <div className="flex justify-between">
          <span className="text-muted-foreground">Period</span>
          <span>{fromDate} — {toDate}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Metrics</span>
          <span>{metricCount} metrics (v{metricsVersion})</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Wallet</span>
          <span className="font-mono">{truncatedWallet}</span>
        </div>
      </CardContent>
    </Card>
  );
}
