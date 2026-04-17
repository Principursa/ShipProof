import { useState } from "react";
import { useWriteContract } from "wagmi";
import { Button } from "@ShipProof/ui/components/button";
import { Input } from "@ShipProof/ui/components/input";
import { Label } from "@ShipProof/ui/components/label";
import { Card, CardContent } from "@ShipProof/ui/components/card";
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
    setIsPending(true); setError(null); setSuccess(null);
    try {
      if (shareScore) await writeContractAsync({ address: SHIPPROOF_ADDRESS, abi: shipProofAbi, functionName: "grantScoreAccess", args: [attestationId, grantee as `0x${string}`] });
      for (const slot of selectedSlots) await writeContractAsync({ address: SHIPPROOF_ADDRESS, abi: shipProofAbi, functionName: "grantMetricAccess", args: [attestationId, slot, grantee as `0x${string}`] });
      const parts = [];
      if (shareScore) parts.push("score");
      if (selectedSlots.length > 0) parts.push(`${selectedSlots.length} metric(s)`);
      setSuccess(`Granted access to ${parts.join(" and ")} for ${grantee.slice(0, 6)}…${grantee.slice(-4)}`);
      setGrantee(""); setSelectedSlots([]); setShareScore(false);
    } catch (err) { setError(err instanceof Error ? err.message : "Failed to grant access"); }
    finally { setIsPending(false); }
  };

  const toggleSlot = (slot: number) => setSelectedSlots((prev) => prev.includes(slot) ? prev.filter((s) => s !== slot) : [...prev, slot]);

  return (
    <Card>
      <CardContent className="p-5 space-y-5">
        <div>
          <h3 className="font-serif text-base tracking-tight">Selective Disclosure</h3>
          <p className="mt-0.5 font-mono text-[10px] text-muted-foreground">
            Grant specific addresses access to your encrypted data.
          </p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="grantee" className="font-mono text-[10px] uppercase tracking-[0.15em]">
            Grantee Address
          </Label>
          <Input
            id="grantee"
            placeholder="0x..."
            value={grantee}
            onChange={(e) => setGrantee(e.target.value)}
            className="font-mono"
          />
          {grantee && !isValidAddress && (
            <p className="font-mono text-[10px] text-destructive">Invalid address</p>
          )}
        </div>

        <div className="space-y-3">
          <div className="flex items-center space-x-2">
            <Checkbox id="share-score" checked={shareScore} onCheckedChange={(c) => setShareScore(!!c)} />
            <Label htmlFor="share-score" className="text-sm">Share overall score</Label>
          </div>

          <div>
            <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.15em] text-muted-foreground">
              Individual Metrics
            </p>
            <div className="grid grid-cols-4 gap-2">
              {Array.from({ length: metricCount }, (_, i) => (
                <div key={i} className="flex items-center space-x-1.5">
                  <Checkbox id={`slot-${i}`} checked={selectedSlots.includes(i)} onCheckedChange={() => toggleSlot(i)} />
                  <Label htmlFor={`slot-${i}`} className="font-mono text-[11px]">{i}</Label>
                </div>
              ))}
            </div>
          </div>
        </div>

        {error && <p className="font-mono text-[11px] text-destructive">{error}</p>}
        {success && (
          <div className="flex items-center gap-2 border border-primary/15 bg-accent/30 p-3 animate-fade-in">
            <Check className="h-3.5 w-3.5 text-primary" />
            <span className="font-mono text-[11px] text-primary">{success}</span>
          </div>
        )}

        <PermitGate action="granting encrypted data access">
          <Button
            onClick={handleGrant}
            disabled={!isValidAddress || (!shareScore && selectedSlots.length === 0) || isPending}
            className="w-full font-mono text-[11px] uppercase tracking-[0.15em]"
          >
            {isPending ? <><Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> Granting…</> : "Grant Access"}
          </Button>
        </PermitGate>
      </CardContent>
    </Card>
  );
}
