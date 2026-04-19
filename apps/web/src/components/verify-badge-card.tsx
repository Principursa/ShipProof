import { useState } from "react";
import { useReadContract, useAccount, useSignMessage } from "wagmi";
import { useCofheReadContractAndDecrypt } from "@cofhe/react";
import { Card, CardContent } from "@ShipProof/ui/components/card";
import { Skeleton } from "@ShipProof/ui/components/skeleton";
import { Button } from "@ShipProof/ui/components/button";
import { Lock, Loader2, AlertCircle } from "lucide-react";
import { shipProofAbi, SHIPPROOF_ADDRESS, AttestationState } from "@/lib/contracts";
import { deriveTier, TIER_COLORS } from "@/lib/tier";
import { lookupMetricsVersion, providerCategoryLabel } from "@/lib/metrics-version";
import { buildReceiptPayload, canonicalize, downloadReceipt } from "@/lib/receipt";

interface VerifyBadgeCardProps {
  attestationId: `0x${string}`;
  /** If true, attempt to decrypt score (requires wallet + permit + grant) */
  attemptDecrypt?: boolean;
}

export function VerifyBadgeCard({ attestationId, attemptDecrypt = false }: VerifyBadgeCardProps) {
  const { address: verifierAddress } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const [signingReceipt, setSigningReceipt] = useState(false);

  const { data: attestation, isLoading } = useReadContract({
    address: SHIPPROOF_ADDRESS,
    abi: shipProofAbi,
    functionName: "attestations",
    args: [attestationId],
  });

  const { data: stateRaw } = useReadContract({
    address: SHIPPROOF_ADDRESS,
    abi: shipProofAbi,
    functionName: "attestationState",
    args: [attestationId],
  });

  const { data: isMinted } = useReadContract({
    address: SHIPPROOF_ADDRESS,
    abi: shipProofAbi,
    functionName: "badgeMinted",
    args: [attestationId],
  });

  const {
    decrypted: decryptedScore,
    disabledDueToMissingPermit,
  } = useCofheReadContractAndDecrypt({
    address: SHIPPROOF_ADDRESS,
    abi: shipProofAbi,
    functionName: "getEncScore",
    args: attemptDecrypt ? [attestationId] : undefined,
  });

  if (isLoading) return <Skeleton className="h-52 w-full" />;

  if (!attestation) {
    return (
      <Card>
        <CardContent className="p-8 text-center">
          <span className="text-sm text-muted-foreground">
            Attestation not found.
          </span>
        </CardContent>
      </Card>
    );
  }

  const [, fromTs, toTs, metricCount, metricsVersion, , wallet] =
    attestation as [string, bigint, bigint, number, number, number, string, bigint, bigint];

  const state = Number(stateRaw ?? 0);
  const fromDate = new Date(Number(fromTs) * 1000).toLocaleDateString();
  const toDate = new Date(Number(toTs) * 1000).toLocaleDateString();
  const truncatedWallet = `${(wallet as string).slice(0, 6)}…${(wallet as string).slice(-4)}`;
  const versionInfo = lookupMetricsVersion(metricsVersion);
  const categoryLabel = providerCategoryLabel(versionInfo.providers);
  const isStale = (Date.now() / 1000 - Number(toTs)) > 90 * 24 * 60 * 60;

  // Determine score display
  let scoreContent: React.ReactNode;
  let receiptData: {
    score: number;
    tier: ReturnType<typeof deriveTier>;
    fromTs: number;
    toTs: number;
    candidateWallet: string;
  } | null = null;

  if (!attemptDecrypt || disabledDueToMissingPermit) {
    scoreContent = (
      <span className="flex items-center gap-1.5 font-mono text-xs text-muted-foreground">
        <Lock className="h-3 w-3" /> Encrypted
      </span>
    );
  } else if (decryptedScore.isError) {
    scoreContent = (
      <span className="flex items-center gap-1.5 font-mono text-xs text-destructive">
        <AlertCircle className="h-3 w-3" /> Error decrypting — try again
      </span>
    );
  } else if (decryptedScore.isLoading) {
    scoreContent = <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />;
  } else if (decryptedScore.data != null) {
    const score = Number(decryptedScore.data);
    const tier = deriveTier(score);
    scoreContent = (
      <div className="flex items-center gap-3">
        <span className="font-mono text-sm font-medium text-primary">
          {score.toLocaleString()} / 10,000
        </span>
        <span className={`font-mono text-xs font-medium ${TIER_COLORS[tier.label] ?? ""}`}>
          {tier.label}
        </span>
      </div>
    );

    // Build receipt data for download button
    receiptData = {
      score,
      tier,
      fromTs: Number(fromTs),
      toTs: Number(toTs),
      candidateWallet: wallet as string,
    };
  } else {
    // Decryption returned null — no access granted
    scoreContent = (
      <span className="flex items-center gap-1.5 font-mono text-xs text-muted-foreground">
        <Lock className="h-3 w-3" /> No access
      </span>
    );
  }

  return (
    <Card className="stamp-border overflow-hidden">
      <CardContent className="p-0">
        {/* Header band */}
        <div className="flex items-center justify-between border-b border-border/50 bg-accent/30 px-5 py-3">
          <div className="flex items-center gap-3">
            <img src="/logo.png" alt="" className="h-7 w-auto" />
            <span className="font-serif text-base tracking-tight">
              ShipProof Badge
            </span>
          </div>
          <span
            className={`px-2.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.2em] ${
              isMinted
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground"
            }`}
          >
            {isMinted ? "Minted" : state >= AttestationState.ScoreComputed ? "Score Ready" : "Processing"}
          </span>
        </div>

        {/* Data rows */}
        <div className="divide-y divide-border/30 px-5">
          <DataRow label="Period" value={`${fromDate} — ${toDate}`} />
          {isStale && (
            <div className="py-2">
              <p className="font-mono text-[10px] text-amber-500">
                This score covers {fromDate}–{toDate}. Consider requesting a fresh attestation.
              </p>
            </div>
          )}
          <DataRow label="Metrics" value={`${metricCount} encrypted`} />
          <DataRow label="Providers" value={categoryLabel} />
          <div className="flex items-center justify-between py-3">
            <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
              Score
            </span>
            {scoreContent}
          </div>
          <DataRow label="Wallet" value={truncatedWallet} mono />
          <DataRow
            label="Attestation"
            value={`${attestationId.slice(0, 10)}…${attestationId.slice(-6)}`}
            mono
          />
        </div>

        {/* Verification receipt */}
        {receiptData && verifierAddress && (
          <div className="border-t border-border/30 px-5 py-3">
            <Button
              size="xs"
              variant="outline"
              disabled={signingReceipt}
              onClick={async () => {
                if (!receiptData || !verifierAddress) return;
                setSigningReceipt(true);
                try {
                  const payload = buildReceiptPayload({
                    attestationId,
                    candidateWallet: receiptData.candidateWallet,
                    verifierWallet: verifierAddress,
                    score: receiptData.score,
                    tier: receiptData.tier,
                    fromTs: receiptData.fromTs,
                    toTs: receiptData.toTs,
                  });
                  const message = canonicalize(payload);
                  const signature = await signMessageAsync({ message });
                  downloadReceipt(payload, signature, verifierAddress);
                } catch {
                  // User rejected signature — no action needed
                } finally {
                  setSigningReceipt(false);
                }
              }}
              className="w-full font-mono text-[10px] uppercase tracking-[0.15em]"
            >
              {signingReceipt ? "Signing…" : "Download Verification Receipt"}
            </Button>
            <p className="mt-1.5 font-mono text-[9px] text-muted-foreground">
              Signs a portable receipt with your wallet. Contains tier and
              pass/fail only — not the numeric score.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function DataRow({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex items-center justify-between py-3">
      <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
        {label}
      </span>
      <span className={`text-sm ${mono ? "font-mono text-xs" : ""}`}>
        {value}
      </span>
    </div>
  );
}
