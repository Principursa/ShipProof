import { useState } from "react";
import { useAccount, useSignMessage } from "wagmi";
import { Button } from "@ShipProof/ui/components/button";
import { Check, Loader2 } from "lucide-react";
import { env } from "@ShipProof/env/web";
import { fetchAuthStatus } from "@/lib/api";

/**
 * Build the same linking message the server expects.
 * Format: "Link github:userId1, x:userId2 to wallet:0x... nonce:123"
 */
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
      <div className="flex items-center gap-2 text-sm text-green-500">
        <Check className="h-4 w-4" /> Wallet linked
      </div>
    );
  }

  if (!address || connectedProviders.length === 0) {
    return (
      <Button size="sm" disabled>
        Link Wallet
      </Button>
    );
  }

  const handleLink = async () => {
    setIsPending(true);
    setError(null);
    try {
      // Fetch current session to get provider userIds for the message
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
    <div className="space-y-1">
      <Button size="sm" disabled={isPending} onClick={handleLink}>
        {isPending ? (
          <>
            <Loader2 className="mr-1 h-3 w-3 animate-spin" /> Signing...
          </>
        ) : (
          "Sign & Link Wallet"
        )}
      </Button>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
