import { createFileRoute, Link } from "@tanstack/react-router";
import { useAccount } from "wagmi";
import { useQuery } from "@tanstack/react-query";
import { createPublicClient, http, parseAbiItem } from "viem";
import { arbitrumSepolia } from "wagmi/chains";
import { Card, CardContent } from "@ShipProof/ui/components/card";
import { Button } from "@ShipProof/ui/components/button";
import { ConnectWallet } from "@/components/connect-wallet";
import { ProviderConnector } from "@/components/provider-connector";
import { WalletLinker } from "@/components/wallet-linker";
import { AttestationStepper } from "@/components/attestation-stepper";
import { fetchAuthStatus, postLogout } from "@/lib/api";
import { SHIPPROOF_ADDRESS, DEPLOY_BLOCK } from "@/lib/contracts";
import { Check, RefreshCw } from "lucide-react";
import { useState, useRef, useEffect } from "react";

const logsClient = createPublicClient({
  chain: arbitrumSepolia,
  transport: http("https://sepolia-rollup.arbitrum.io/rpc"),
});

export const Route = createFileRoute("/attest")({
  component: AttestPage,
});

function AttestPage() {
  const { isConnected, address } = useAccount();
  const { data: status, refetch: refetchStatus } = useQuery({
    queryKey: ["auth-status"],
    queryFn: fetchAuthStatus,
    refetchInterval: 5000,
  });

  const [isWalletLinked, setIsWalletLinked] = useState(!!status?.wallet);
  const [completedAttestationId, setCompletedAttestationId] = useState<`0x${string}` | null>(null);
  const prevAddress = useRef(address);

  // Reset server session when wallet changes
  useEffect(() => {
    if (prevAddress.current && address && prevAddress.current !== address) {
      postLogout().then(() => {
        setIsWalletLinked(false);
        setCompletedAttestationId(null);
        refetchStatus();
      });
    }
    prevAddress.current = address;
  }, [address, refetchStatus]);

  const [existingBadge, setExistingBadge] = useState<`0x${string}` | null>(null);
  const [showReAttest, setShowReAttest] = useState(false);

  // Check for existing badges when wallet connects
  useEffect(() => {
    if (!address) { setExistingBadge(null); return; }
    logsClient.getLogs({
      address: SHIPPROOF_ADDRESS,
      event: parseAbiItem("event BadgeMinted(bytes32 indexed attestationId, address indexed to, uint8 tier)"),
      args: { to: address },
      fromBlock: DEPLOY_BLOCK,
      toBlock: "latest",
    }).then((logs) => {
      if (logs.length > 0) {
        setExistingBadge(logs[logs.length - 1].args.attestationId as `0x${string}`);
      } else {
        setExistingBadge(null);
      }
    }).catch(() => setExistingBadge(null));
  }, [address, completedAttestationId]);

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

        <Step number={4} title="Generate Score" done={!!completedAttestationId || !!existingBadge}>
          {canAttest ? (
            existingBadge && !showReAttest ? (
              <div className="space-y-3">
                <div className="flex items-center gap-3 border border-primary/20 bg-accent/30 p-3">
                  <Check className="h-4 w-4 text-primary" />
                  <div className="flex-1">
                    <p className="font-mono text-[11px] text-foreground">
                      You already have a ShipProof badge
                    </p>
                    <p className="font-mono text-[9px] text-muted-foreground">
                      {existingBadge.slice(0, 10)}…{existingBadge.slice(-6)}
                    </p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Link to="/verify/$attestationId" params={{ attestationId: existingBadge }} className="flex-1">
                    <Button variant="outline" className="w-full font-mono text-[10px] uppercase tracking-[0.15em]">
                      View Badge
                    </Button>
                  </Link>
                  <Button
                    variant="ghost"
                    onClick={() => setShowReAttest(true)}
                    className="flex-1 font-mono text-[10px] uppercase tracking-[0.15em]"
                  >
                    <RefreshCw className="mr-1.5 h-3 w-3" />
                    Update Score
                  </Button>
                </div>
              </div>
            ) : (
              <AttestationStepper onComplete={(id) => {
                setCompletedAttestationId(id);
                setExistingBadge(id);
                setShowReAttest(false);
              }} />
            )
          ) : (
            <p className="text-sm text-muted-foreground">
              Complete steps 1–3 to begin.
            </p>
          )}
        </Step>
      </div>

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
