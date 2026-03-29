import { createFileRoute } from "@tanstack/react-router";
import { useAccount } from "wagmi";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@ShipProof/ui/components/card";
import { ConnectWallet } from "@/components/connect-wallet";
import { ProviderConnector } from "@/components/provider-connector";
import { WalletLinker } from "@/components/wallet-linker";
import { AttestationStepper } from "@/components/attestation-stepper";
import { BadgeDisplay } from "@/components/badge-display";
import { SelectiveDisclosure } from "@/components/selective-disclosure";
import { fetchAuthStatus } from "@/lib/api";
import { Check, Circle } from "lucide-react";
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
    <div className="container mx-auto max-w-xl px-4 py-6 space-y-6">
      <h1 className="text-2xl font-bold">Ship Proof Attestation</h1>

      <Section number={1} title="Connect Wallet" done={isConnected}>
        <ConnectWallet />
      </Section>

      <Section number={2} title="Connect Providers" done={hasProviders}>
        <ProviderConnector />
      </Section>

      <Section number={3} title="Link Wallet" done={walletLinked}>
        <WalletLinker
          isLinked={walletLinked}
          connectedProviders={connectedProviders}
          onLinked={() => {
            setIsWalletLinked(true);
            refetchStatus();
          }}
        />
      </Section>

      <Section number={4} title="Generate Score" done={!!completedAttestationId}>
        {canAttest ? (
          <AttestationStepper onComplete={(id) => setCompletedAttestationId(id)} />
        ) : (
          <p className="text-sm text-muted-foreground">
            Complete steps 1-3 to begin.
          </p>
        )}
      </Section>

      {completedAttestationId && (
        <>
          <BadgeDisplay attestationId={completedAttestationId} />
          <SelectiveDisclosure
            attestationId={completedAttestationId}
            metricCount={8}
          />
        </>
      )}
    </div>
  );
}

function Section({
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
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          {done ? (
            <Check className="h-5 w-5 text-green-500" />
          ) : (
            <Circle className="h-5 w-5 text-muted-foreground" />
          )}
          <span>
            Step {number}: {title}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}
