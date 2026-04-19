import { useState } from "react";
import { createFileRoute, Link, Outlet, useMatch } from "@tanstack/react-router";
import { createPublicClient, http, parseAbiItem } from "viem";
import { arbitrumSepolia } from "wagmi/chains";
import { Button } from "@ShipProof/ui/components/button";
import { Input } from "@ShipProof/ui/components/input";
import { Label } from "@ShipProof/ui/components/label";
import { Loader2, Search } from "lucide-react";
import { isAddress } from "viem";
import { SHIPPROOF_ADDRESS, DEPLOY_BLOCK } from "@/lib/contracts";
import { VerifyBadgeCard } from "@/components/verify-badge-card";
import { env } from "@ShipProof/env/web";

export const Route = createFileRoute("/verify")({
  component: VerifyPage,
});

// Use public Arbitrum Sepolia RPC for log queries — no block range limits
const logsClient = createPublicClient({
  chain: arbitrumSepolia,
  transport: http("https://sepolia-rollup.arbitrum.io/rpc"),
});

interface BadgeResult {
  attestationId: `0x${string}`;
  tier: number;
}

function VerifyPage() {
  const childMatch = useMatch({ from: "/verify/$attestationId", shouldThrow: false });

  // If a child route is active (e.g. /verify/$attestationId), render it instead
  if (childMatch) return <Outlet />;

  return <VerifyLookup />;
}

function VerifyLookup() {
  const [address, setAddress] = useState("");
  const [results, setResults] = useState<BadgeResult[] | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isValid = isAddress(address);

  const handleSearch = async () => {
    if (!isValid) return;
    setIsSearching(true);
    setError(null);
    setResults(null);
    try {
      const logs = await logsClient.getLogs({
        address: SHIPPROOF_ADDRESS,
        event: parseAbiItem(
          "event BadgeMinted(bytes32 indexed attestationId, address indexed to, uint8 tier)",
        ),
        args: { to: address as `0x${string}` },
        fromBlock: DEPLOY_BLOCK,
        toBlock: "latest",
      });

      const badges: BadgeResult[] = logs
        .map((log) => ({
          attestationId: log.args.attestationId as `0x${string}`,
          tier: Number(log.args.tier ?? 0),
        }))
        .reverse();

      setResults(badges);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to search badges",
      );
    } finally {
      setIsSearching(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-xl px-6 py-12 md:py-16">
      <div className="mb-10 animate-fade-up">
        <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.3em] text-primary">
          Verification Portal
        </p>
        <h1 className="font-serif text-4xl tracking-tight">
          Verify a Candidate
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Enter a wallet address to check for ShipProof badges.
        </p>
      </div>

      <div
        className="space-y-4 animate-fade-up"
        style={{ animationDelay: "100ms" }}
      >
        <div className="space-y-1.5">
          <Label
            htmlFor="wallet"
            className="font-mono text-[10px] uppercase tracking-[0.15em]"
          >
            Candidate Wallet Address
          </Label>
          <div className="flex gap-2">
            <Input
              id="wallet"
              placeholder="0x..."
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              className="flex-1 font-mono"
            />
            <Button
              onClick={handleSearch}
              disabled={!isValid || isSearching}
              className="font-mono text-[11px] uppercase tracking-[0.15em]"
            >
              {isSearching ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Search className="h-3.5 w-3.5" />
              )}
            </Button>
          </div>
          {address && !isValid && (
            <p className="font-mono text-[10px] text-destructive">
              Invalid address
            </p>
          )}
        </div>

        {error && (
          <p className="font-mono text-[11px] text-destructive">{error}</p>
        )}

        {results !== null && results.length === 0 && (
          <div className="border border-dashed border-border p-8 text-center">
            <p className="text-sm text-muted-foreground">
              No ShipProof badges found for this address.
            </p>
          </div>
        )}

        {results !== null && results.length > 0 && (
          <div className="space-y-3">
            <p className="font-mono text-[10px] uppercase tracking-[0.15em] text-muted-foreground">
              {results.length} badge{results.length > 1 ? "s" : ""} found
            </p>
            {results.map((badge, i) => (
              <Link
                key={badge.attestationId}
                to="/verify/$attestationId"
                params={{ attestationId: badge.attestationId }}
                className="block transition-opacity hover:opacity-80"
              >
                <div className="relative">
                  {i === 0 && results.length > 1 && (
                    <span className="absolute -top-2 right-3 z-10 bg-primary px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.2em] text-primary-foreground">
                      Latest
                    </span>
                  )}
                  <VerifyBadgeCard attestationId={badge.attestationId} />
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
