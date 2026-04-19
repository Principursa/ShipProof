import { useState } from "react";
import { useWriteContract } from "wagmi";
import { Button } from "@ShipProof/ui/components/button";
import { Input } from "@ShipProof/ui/components/input";
import { Label } from "@ShipProof/ui/components/label";
import { Card, CardContent } from "@ShipProof/ui/components/card";
import { Checkbox } from "@ShipProof/ui/components/checkbox";
import {
  Loader2,
  Check,
  Copy,
  ChevronDown,
  AlertTriangle,
} from "lucide-react";
import { shipProofAbi, SHIPPROOF_ADDRESS } from "@/lib/contracts";
import { isAddress } from "viem";
import { friendlyError } from "@/lib/errors";
import { PermitGate } from "./permit-gate";

interface SelectiveDisclosureProps {
  attestationId: `0x${string}`;
  metricCount: number;
}

export function SelectiveDisclosure({
  attestationId,
  metricCount,
}: SelectiveDisclosureProps) {
  const [grantee, setGrantee] = useState("");
  const [selectedSlots, setSelectedSlots] = useState<number[]>([]);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [isPending, setIsPending] = useState(false);
  const [shareLink, setShareLink] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const { writeContractAsync } = useWriteContract();
  const isValidAddress = isAddress(grantee);

  const handleShareScore = async () => {
    if (!isValidAddress) return;
    setIsPending(true);
    setError(null);
    setSuccess(null);
    setShareLink(null);
    try {
      await writeContractAsync({
        address: SHIPPROOF_ADDRESS,
        abi: shipProofAbi,
        functionName: "grantScoreAccess",
        args: [attestationId, grantee as `0x${string}`],
      });

      // Grant individual metrics if advanced is open and slots selected
      for (const slot of selectedSlots) {
        await writeContractAsync({
          address: SHIPPROOF_ADDRESS,
          abi: shipProofAbi,
          functionName: "grantMetricAccess",
          args: [attestationId, slot, grantee as `0x${string}`],
        });
      }

      const parts = ["score"];
      if (selectedSlots.length > 0)
        parts.push(`${selectedSlots.length} metric(s)`);
      setSuccess(
        `Shared ${parts.join(" and ")} with ${grantee.slice(0, 6)}…${grantee.slice(-4)}`,
      );
      setShareLink(
        `${window.location.origin}/verify/${attestationId}`,
      );
      setGrantee("");
      setSelectedSlots([]);
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setIsPending(false);
    }
  };

  const toggleSlot = (slot: number) =>
    setSelectedSlots((prev) =>
      prev.includes(slot) ? prev.filter((s) => s !== slot) : [...prev, slot],
    );

  const copyLink = async () => {
    if (!shareLink) return;
    await navigator.clipboard.writeText(shareLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Card>
      <CardContent className="space-y-5 p-5">
        <div>
          <h3 className="font-serif text-base tracking-tight">
            Share with Verifier
          </h3>
          <p className="mt-0.5 font-mono text-[10px] text-muted-foreground">
            Share your encrypted score with a hiring screener or grant reviewer.
          </p>
        </div>

        <div className="space-y-1.5">
          <Label
            htmlFor="grantee"
            className="font-mono text-[10px] uppercase tracking-[0.15em]"
          >
            Verifier Wallet Address
          </Label>
          <Input
            id="grantee"
            placeholder="0x..."
            value={grantee}
            onChange={(e) => setGrantee(e.target.value)}
            className="font-mono"
          />
          {grantee && !isValidAddress && (
            <p className="font-mono text-[10px] text-destructive">
              Invalid address
            </p>
          )}
        </div>

        {/* Advanced: per-metric disclosure */}
        <div>
          <button
            type="button"
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.15em] text-muted-foreground hover:text-foreground transition-colors"
          >
            <ChevronDown
              className={`h-3 w-3 transition-transform ${showAdvanced ? "rotate-180" : ""}`}
            />
            Share individual metrics (advanced)
          </button>

          {showAdvanced && (
            <div className="mt-3 space-y-2 border-l-2 border-amber-500/30 pl-4">
              <div className="flex items-start gap-2">
                <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0 text-amber-500" />
                <p className="font-mono text-[10px] text-amber-500">
                  Sharing individual metric values could allow a verifier to
                  cross-reference public profiles and identify your accounts.
                </p>
              </div>
              <div className="grid grid-cols-4 gap-2">
                {Array.from({ length: metricCount }, (_, i) => (
                  <div key={i} className="flex items-center space-x-1.5">
                    <Checkbox
                      id={`slot-${i}`}
                      checked={selectedSlots.includes(i)}
                      onCheckedChange={() => toggleSlot(i)}
                    />
                    <Label
                      htmlFor={`slot-${i}`}
                      className="font-mono text-[11px]"
                    >
                      {i}
                    </Label>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {error && (
          <p className="font-mono text-[11px] text-destructive">{error}</p>
        )}
        {success && (
          <div className="space-y-2 border border-primary/15 bg-accent/30 p-3 animate-fade-in">
            <div className="flex items-center gap-2">
              <Check className="h-3.5 w-3.5 text-primary" />
              <span className="font-mono text-[11px] text-primary">
                {success}
              </span>
            </div>
            {shareLink && (
              <div className="flex items-center gap-2">
                <code className="flex-1 truncate rounded bg-muted px-2 py-1 font-mono text-[10px]">
                  {shareLink}
                </code>
                <Button
                  size="xs"
                  variant="ghost"
                  onClick={copyLink}
                  className="shrink-0 font-mono text-[10px]"
                >
                  {copied ? (
                    <Check className="h-3 w-3" />
                  ) : (
                    <Copy className="h-3 w-3" />
                  )}
                </Button>
              </div>
            )}
          </div>
        )}

        <PermitGate action="sharing encrypted data">
          <Button
            onClick={handleShareScore}
            disabled={!isValidAddress || isPending}
            className="w-full font-mono text-[11px] uppercase tracking-[0.15em]"
          >
            {isPending ? (
              <>
                <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />{" "}
                Sharing…
              </>
            ) : (
              "Share Score"
            )}
          </Button>
        </PermitGate>
      </CardContent>
    </Card>
  );
}
