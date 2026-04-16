import { useQuery } from "@tanstack/react-query";
import { Check, ExternalLink } from "lucide-react";
import { Button } from "@ShipProof/ui/components/button";
import { Skeleton } from "@ShipProof/ui/components/skeleton";
import { fetchProviders, fetchAuthStatus } from "@/lib/api";
import { env } from "@ShipProof/env/web";

export function ProviderConnector() {
  const { data: providers, isLoading: loadingProviders } = useQuery({
    queryKey: ["providers"],
    queryFn: fetchProviders,
  });

  const { data: status, isLoading: loadingStatus } = useQuery({
    queryKey: ["auth-status"],
    queryFn: fetchAuthStatus,
    refetchInterval: 5000,
  });

  if (loadingProviders || loadingStatus) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
      </div>
    );
  }

  if (!providers || providers.length === 0) {
    return <p className="font-mono text-xs text-muted-foreground">No providers configured.</p>;
  }

  const connectedIds = status?.connected ?? [];

  return (
    <div className="space-y-2">
      {providers.map((provider) => {
        const isConnected = connectedIds.includes(provider.id);
        return (
          <div
            key={provider.id}
            className={`flex items-center justify-between border p-3 transition-colors ${
              isConnected ? "border-primary/20 bg-accent/30" : "border-border"
            }`}
          >
            <div className="flex items-center gap-3">
              {isConnected ? (
                <Check className="h-4 w-4 text-primary" />
              ) : (
                <div className="h-4 w-4 border border-muted-foreground/40" />
              )}
              <span className="font-mono text-xs font-medium">{provider.displayName}</span>
            </div>
            {isConnected ? (
              <span className="font-mono text-[10px] uppercase tracking-wider text-primary">
                Linked
              </span>
            ) : (
              <Button
                size="xs"
                variant="outline"
                className="font-mono text-[10px] uppercase tracking-wider"
                onClick={() => {
                  window.location.href = `${env.VITE_SERVER_URL}/auth/${provider.id}`;
                }}
              >
                Connect <ExternalLink className="ml-1 h-2.5 w-2.5" />
              </Button>
            )}
          </div>
        );
      })}
    </div>
  );
}
