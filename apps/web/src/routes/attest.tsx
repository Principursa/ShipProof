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
    <div className="mx-auto w-full max-w-xl px-6 py-10">
      <div className="mb-8">
        <h1 className="font-mono text-2xl font-bold tracking-tight">Attestation</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Connect, verify, and mint your confidential builder proof.
        </p>
      </div>

      <div className="space-y-5">
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
            <p className="font-mono text-xs text-muted-foreground">
              Complete steps 1–3 to begin.
            </p>
          )}
        </Step>
      </div>

      {completedAttestationId && (
        <div className="mt-10 space-y-5">
          <div className="flex items-center gap-2 font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground">
            <span className="inline-block h-px w-8 bg-border" />
            Your Proof
            <span className="inline-block h-px w-8 bg-border" />
          </div>
          <BadgeDisplay attestationId={completedAttestationId} />
          <SelectiveDisclosure
            attestationId={completedAttestationId}
            metricCount={8}
          />
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
    <Card className={done ? "border-primary/20 bg-accent/30" : ""}>
      <CardContent className="p-5">
        <div className="mb-3 flex items-center gap-3">
          <span
            className={`flex h-6 w-6 items-center justify-center font-mono text-xs font-bold ${
              done
                ? "bg-primary text-primary-foreground"
                : "border border-border text-muted-foreground"
            }`}
          >
            {done ? <Check className="h-3.5 w-3.5" /> : number}
          </span>
          <span className="font-mono text-xs font-semibold uppercase tracking-wider">
            {title}
          </span>
        </div>
        {children}
      </CardContent>
    </Card>
  );
}
