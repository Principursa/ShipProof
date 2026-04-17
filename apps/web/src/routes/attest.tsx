import { createFileRoute } from "@tanstack/react-router";
import { useAccount } from "wagmi";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@ShipProof/ui/components/card";
import { ConnectWallet } from "@/components/connect-wallet";
import { ProviderConnector } from "@/components/provider-connector";
import { WalletLinker } from "@/components/wallet-linker";
import { AttestationStepper } from "@/components/attestation-stepper";
import { BadgeDisplay } from "@/components/badge-display";
import { SelectiveDisclosure } from "@/components/selective-disclosure";
import { fetchAuthStatus } from "@/lib/api";
import { Check } from "lucide-react";
import { useState } from "react";

export const Route = createFileRoute("/attest")({
  component: AttestPage,
});

function AttestPage() {
  const { isConnected } = useAccount();
  const { data: status, refetch: refetchStatus } = useQuery({
    queryKey: ["auth-status"],
    queryFn: fetchAuthStatus,
    refetchInterval: 5000,
  });

  const [isWalletLinked, setIsWalletLinked] = useState(!!status?.wallet);
  const [completedAttestationId, setCompletedAttestationId] = useState<`0x${string}` | null>(null);

  const walletLinked = isWalletLinked || !!status?.wallet;
  const connectedProviders = status?.connected ?? [];
  const hasProviders = connectedProviders.length > 0;
  const canAttest = isConnected && hasProviders && walletLinked;

  return (
    <div className="mx-auto w-full max-w-xl px-6 py-12 md:py-16">
      <div className="mb-10 animate-fade-up">
        <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.3em] text-primary">
          Builder Verification
        </p>
        <h1 className="font-serif text-4xl tracking-tight">Attestation</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Connect, verify, and mint your confidential builder proof.
        </p>
      </div>

      <div className="stagger-children space-y-4">
        <Step number={1} title="Connect Wallet" done={isConnected}>
          <ConnectWallet />
        </Step>

        <Step number={2} title="Connect Providers" done={hasProviders}>
          <ProviderConnector />
        </Step>

        <Step number={3} title="Link Wallet" done={walletLinked}>
          <WalletLinker
            isLinked={walletLinked}
            connectedProviders={connectedProviders}
            onLinked={() => {
              setIsWalletLinked(true);
              refetchStatus();
            }}
          />
        </Step>

        <Step number={4} title="Generate Score" done={!!completedAttestationId}>
          {canAttest ? (
            <AttestationStepper onComplete={(id) => setCompletedAttestationId(id)} />
          ) : (
            <p className="text-sm text-muted-foreground">
              Complete steps 1–3 to begin.
            </p>
          )}
        </Step>
      </div>

      {completedAttestationId && (
        <div className="mt-14 animate-fade-up">
          <div className="mb-6 flex items-center gap-3">
            <div className="h-px flex-1 bg-border" />
            <span className="font-mono text-[10px] uppercase tracking-[0.3em] text-primary">
              Your Proof
            </span>
            <div className="h-px flex-1 bg-border" />
          </div>
          <div className="space-y-4">
            <BadgeDisplay attestationId={completedAttestationId} />
            <SelectiveDisclosure
              attestationId={completedAttestationId}
              metricCount={8}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function Step({
  number,
  title,
  done,
  children,
}: {
  number: number;
  title: string;
  done: boolean;
  children: React.ReactNode;
}) {
  return (
    <Card className={`transition-all duration-300 ${done ? "stamp-border" : ""}`}>
      <CardContent className="p-5">
        <div className="mb-3 flex items-center gap-3">
          <span
            className={`flex h-7 w-7 items-center justify-center text-xs font-medium transition-all duration-300 ${
              done
                ? "bg-primary text-primary-foreground animate-stamp"
                : "border border-border text-muted-foreground"
            }`}
          >
            {done ? <Check className="h-3.5 w-3.5" /> : <span className="font-mono">{number}</span>}
          </span>
          <span className="font-mono text-[11px] font-medium uppercase tracking-[0.15em]">
            {title}
          </span>
          {done && (
            <span className="ml-auto font-mono text-[9px] uppercase tracking-[0.2em] text-primary/60">
              Verified
            </span>
          )}
        </div>
        {children}
      </CardContent>
    </Card>
  );
}
