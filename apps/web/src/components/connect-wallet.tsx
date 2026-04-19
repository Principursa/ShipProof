import { useAccount, useConnect, useDisconnect } from "wagmi";
import { injected } from "wagmi/connectors";
import { Button } from "@ShipProof/ui/components/button";

export function ConnectWallet() {
  const { address, isConnected } = useAccount();
  const { connect, isPending } = useConnect();
  const { disconnect } = useDisconnect();

  if (isConnected && address) {
    return (
      <div className="flex items-center gap-2">
        <span className="border border-border bg-card px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground sm:px-2.5 sm:py-1 sm:text-[11px]">
          {address.slice(0, 6)}…{address.slice(-4)}
        </span>
        <button
          onClick={() => disconnect()}
          className="font-mono text-[10px] text-muted-foreground/50 transition-colors hover:text-foreground"
        >
          ×
        </button>
      </div>
    );
  }

  return (
    <Button
      size="sm"
      disabled={isPending}
      onClick={() => connect({ connector: injected() })}
      className="font-mono text-[11px] uppercase tracking-[0.15em]"
    >
      {isPending ? "Connecting…" : "Connect"}
    </Button>
  );
}
