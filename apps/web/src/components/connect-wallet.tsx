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
        <span className="border border-border bg-muted px-2 py-0.5 font-mono text-xs text-muted-foreground">
          {address.slice(0, 6)}…{address.slice(-4)}
        </span>
        <Button variant="ghost" size="xs" onClick={() => disconnect()} className="font-mono text-xs">
          ×
        </Button>
      </div>
    );
  }

  return (
    <Button
      size="sm"
      disabled={isPending}
      onClick={() => connect({ connector: injected() })}
      className="font-mono text-xs uppercase tracking-wider"
    >
      {isPending ? "Connecting…" : "Connect"}
    </Button>
  );
}
