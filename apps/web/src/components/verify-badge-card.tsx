import { useState } from "react";
import { useAccount, useReadContract } from "wagmi";
import { arbitrumSepolia } from "wagmi/chains";
import { Card, CardContent } from "@ShipProof/ui/components/card";
import { Skeleton } from "@ShipProof/ui/components/skeleton";
import { Lock, Loader2, Info } from "lucide-react";
import { shipProofAbi, SHIPPROOF_ADDRESS, AttestationState } from "@/lib/contracts";
import { deriveTier, TIER_COLORS, TIER_BG_COLORS } from "@/lib/tier";
import { lookupMetricsVersion, providerCategoryLabel } from "@/lib/metrics-version";
import { useDecryptScore } from "@/hooks/use-decrypt-score";

interface VerifyBadgeCardProps {
  attestationId: `0x${string}`;
}

export function VerifyBadgeCard({ attestationId }: VerifyBadgeCardProps) {
  const { chainId, isConnected } = useAccount();
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

  const state = Number(stateRaw ?? 0);
  const isOnCorrectChain = chainId === arbitrumSepolia.id;
  const canDecryptScore =
    isConnected &&
    isOnCorrectChain &&
    state >= AttestationState.ScoreComputed;
  const {
    data: score,
    isLoading: isScoreLoading,
    isError: isScoreError,
    error: scoreError,
  } = useDecryptScore(attestationId, canDecryptScore);

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

  const fromDate = new Date(Number(fromTs) * 1000).toLocaleDateString();
  const toDate = new Date(Number(toTs) * 1000).toLocaleDateString();
  const truncatedWallet = `${(wallet as string).slice(0, 6)}…${(wallet as string).slice(-4)}`;
  const versionInfo = lookupMetricsVersion(metricsVersion);
  const categoryLabel = providerCategoryLabel(versionInfo.providers);
  const isStale = (Date.now() / 1000 - Number(toTs)) > 90 * 24 * 60 * 60;
  const scoreLabel = !isConnected
    ? "Connect wallet"
    : !isOnCorrectChain
      ? "Wrong chain"
    : state < AttestationState.ScoreComputed
      ? "Processing"
      : isScoreLoading
        ? "Decrypting…"
        : score !== null
          ? score.toLocaleString()
          : scoreError?.message.includes("permit")
            ? "Permit required"
            : isScoreError
              ? "Access required"
              : "Encrypted";

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
          <div className="py-3">
            <div className="flex items-center justify-between">
              <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                Score
              </span>
              {score !== null ? (
                <ScoreWithTier score={score} />
              ) : (
                <span className="flex items-center gap-1.5 font-mono text-xs text-muted-foreground">
                  {isScoreLoading ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Lock className="h-3 w-3" />
                  )}
                  {scoreLabel}
                </span>
              )}
            </div>
          </div>
          <DataRow label="Wallet" value={truncatedWallet} mono />
          <DataRow
            label="Attestation"
            value={`${attestationId.slice(0, 10)}…${attestationId.slice(-6)}`}
            mono
          />
        </div>
      </CardContent>
    </Card>
  );
}

function ScoreWithTier({ score }: { score: number }) {
  const [showTooltip, setShowTooltip] = useState(false);
  const tier = deriveTier(score);

  return (
    <div className="relative flex items-center gap-2">
      <span className="font-mono text-sm font-medium text-primary">
        {score.toLocaleString()} / 10,000
      </span>
      <button
        type="button"
        className={`relative px-1.5 py-0.5 font-mono text-[9px] font-medium uppercase tracking-[0.15em] ${TIER_COLORS[tier.label]} ${TIER_BG_COLORS[tier.label]}`}
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
        onClick={() => setShowTooltip(!showTooltip)}
      >
        {tier.label}
        <Info className="ml-0.5 inline h-2.5 w-2.5 opacity-50" />
      </button>

      {showTooltip && (
        <div className="absolute right-0 top-full z-20 mt-2 w-56 border border-border bg-card p-3 shadow-lg">
          <p className={`mb-1 font-mono text-[10px] font-medium uppercase tracking-[0.15em] ${TIER_COLORS[tier.label]}`}>
            {tier.label} — {tier.range}
          </p>
          <p className="font-mono text-[10px] leading-relaxed text-muted-foreground">
            {tier.description}
          </p>
          <div className="mt-2 h-px bg-border" />
          <div className="mt-2 space-y-1">
            {(["Diamond", "Gold", "Silver", "Bronze"] as const).map((t) => {
              const info = deriveTier(t === "Diamond" ? 7500 : t === "Gold" ? 5000 : t === "Silver" ? 2500 : 0);
              const isActive = t === tier.label;
              return (
                <div key={t} className={`flex items-center justify-between font-mono text-[9px] ${isActive ? TIER_COLORS[t] : "text-muted-foreground/50"}`}>
                  <span>{t}</span>
                  <span>{info.range}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
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
