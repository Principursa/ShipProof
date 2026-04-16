import { useState } from "react";
import { useWriteContract } from "wagmi";
import { Button } from "@ShipProof/ui/components/button";
import { Input } from "@ShipProof/ui/components/input";
import { Label } from "@ShipProof/ui/components/label";
import { Card, CardContent, CardHeader, CardTitle } from "@ShipProof/ui/components/card";
import { Checkbox } from "@ShipProof/ui/components/checkbox";
import { Loader2, Check } from "lucide-react";
import { shipProofAbi, SHIPPROOF_ADDRESS } from "@/lib/contracts";
import { isAddress } from "viem";
import { PermitGate } from "./permit-gate";

interface SelectiveDisclosureProps {
  attestationId: `0x${string}`;
  metricCount: number;
}

export function SelectiveDisclosure({ attestationId, metricCount }: SelectiveDisclosureProps) {
  const [grantee, setGrantee] = useState("");
  const [selectedSlots, setSelectedSlots] = useState<number[]>([]);
  const [shareScore, setShareScore] = useState(false);
  const [isPending, setIsPending] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { writeContractAsync } = useWriteContract();

  const isValidAddress = isAddress(grantee);

  const handleGrant = async () => {
    if (!isValidAddress) return;
    setIsPending(true);
    setError(null);
    setSuccess(null);

    try {
      if (shareScore) {
        await writeContractAsync({
          address: SHIPPROOF_ADDRESS,
          abi: shipProofAbi,
          functionName: "grantScoreAccess",
          args: [attestationId, grantee as `0x${string}`],
        });
      }

      for (const slot of selectedSlots) {
        await writeContractAsync({
          address: SHIPPROOF_ADDRESS,
          abi: shipProofAbi,
          functionName: "grantMetricAccess",
          args: [attestationId, slot, grantee as `0x${string}`],
        });
      }

      const parts = [];
      if (shareScore) parts.push("score");
      if (selectedSlots.length > 0) parts.push(`${selectedSlots.length} metric(s)`);
      setSuccess(`Granted access to ${parts.join(" and ")} for ${grantee.slice(0, 6)}...${grantee.slice(-4)}`);
      setGrantee("");
      setSelectedSlots([]);
      setShareScore(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to grant access");
    } finally {
      setIsPending(false);
    }
  };

  const toggleSlot = (slot: number) => {
    setSelectedSlots((prev) =>
      prev.includes(slot) ? prev.filter((s) => s !== slot) : [...prev, slot],
    );
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Selective Disclosure</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="grantee">Grantee Address</Label>
          <Input
            id="grantee"
            placeholder="0x..."
            value={grantee}
            onChange={(e) => setGrantee(e.target.value)}
          />
          {grantee && !isValidAddress && (
            <p className="text-xs text-destructive">Invalid Ethereum address</p>
          )}
        </div>

        <div className="space-y-2">
          <div className="flex items-center space-x-2">
            <Checkbox
              id="share-score"
              checked={shareScore}
              onCheckedChange={(checked) => setShareScore(!!checked)}
            />
            <Label htmlFor="share-score">Share overall score</Label>
          </div>

          <p className="text-sm font-medium">Share individual metrics:</p>
          {Array.from({ length: metricCount }, (_, i) => (
            <div key={i} className="flex items-center space-x-2">
              <Checkbox
                id={`slot-${i}`}
                checked={selectedSlots.includes(i)}
                onCheckedChange={() => toggleSlot(i)}
              />
              <Label htmlFor={`slot-${i}`}>Metric slot {i}</Label>
            </div>
          ))}
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}
        {success && (
          <p className="text-sm text-green-500 flex items-center gap-1">
            <Check className="h-4 w-4" /> {success}
          </p>
        )}

        <PermitGate action="granting encrypted data access">
          <Button
            onClick={handleGrant}
            disabled={!isValidAddress || (!shareScore && selectedSlots.length === 0) || isPending}
          >
            {isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Granting...
              </>
            ) : (
              "Grant Access"
            )}
          </Button>
        </PermitGate>
      </CardContent>
    </Card>
  );
}
