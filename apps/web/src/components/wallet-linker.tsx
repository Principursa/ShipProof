import { useState } from "react";
import { useAccount, useSignMessage } from "wagmi";
import { Button } from "@ShipProof/ui/components/button";
import { Check, Loader2 } from "lucide-react";
import { env } from "@ShipProof/env/web";
import { fetchAuthStatus } from "@/lib/api";

function buildLinkingMessage(
  providers: Record<string, { userId: string }>,
  walletAddress: string,
  nonce: string,
): string {
  const parts = Object.entries(providers)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([id, s]) => `${id}:${s.userId}`);
  return `Link ${parts.join(", ")} to wallet:${walletAddress} nonce:${nonce}`;
}

interface WalletLinkerProps {
  isLinked: boolean;
  connectedProviders: string[];
  onLinked: () => void;
}

export function WalletLinker({ isLinked, connectedProviders, onLinked }: WalletLinkerProps) {
  const { address } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (isLinked) {
    return (
      <div className="flex items-center gap-2">
        <Check className="h-4 w-4 text-primary" />
        <span className="font-mono text-xs text-primary">Wallet linked</span>
      </div>
    );
  }

  if (!address || connectedProviders.length === 0) {
    return (
      <Button size="sm" disabled className="font-mono text-xs uppercase tracking-wider">
        Link Wallet
      </Button>
    );
  }

  const handleLink = async () => {
    setIsPending(true);
    setError(null);
    try {
      const status = await fetchAuthStatus();
      const nonce = crypto.randomUUID();
      const message = buildLinkingMessage(status.providers, address, nonce);

      const signature = await signMessageAsync({ message });

      const res = await fetch(`${env.VITE_SERVER_URL}/auth/link-wallet`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ wallet: address, signature, nonce }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Linking failed");
      }

      onLinked();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to link wallet");
    } finally {
      setIsPending(false);
    }
  };

  return (
    <div className="space-y-2">
      <Button
        size="sm"
        disabled={isPending}
        onClick={handleLink}
        className="font-mono text-xs uppercase tracking-wider"
      >
        {isPending ? (
          <>
            <Loader2 className="mr-1.5 h-3 w-3 animate-spin" /> Signing…
          </>
        ) : (
          "Sign & Link Wallet"
        )}
      </Button>
      {error && <p className="font-mono text-xs text-destructive">{error}</p>}
    </div>
  );
}
