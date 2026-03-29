import { useQuery } from "@tanstack/react-query";
import { Check, ExternalLink } from "lucide-react";
import { Button } from "@ShipProof/ui/components/button";
import { Card, CardContent } from "@ShipProof/ui/components/card";
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
      <div className="space-y-3">
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
      </div>
    );
  }

  if (!providers || providers.length === 0) {
    return <p className="text-sm text-muted-foreground">No providers configured.</p>;
  }

  const connectedIds = status?.connected ?? [];

  return (
    <div className="space-y-3">
      {providers.map((provider) => {
        const isConnected = connectedIds.includes(provider.id);
        return (
          <Card key={provider.id}>
            <CardContent className="flex items-center justify-between p-4">
              <div className="flex items-center gap-3">
                {isConnected ? (
                  <Check className="h-5 w-5 text-green-500" />
                ) : (
                  <div className="h-5 w-5 rounded-full border-2 border-muted-foreground" />
                )}
                <span className="font-medium">{provider.displayName}</span>
              </div>
              {isConnected ? (
                <span className="text-sm text-green-500">Connected</span>
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    window.location.href = `${env.VITE_SERVER_URL}/auth/${provider.id}`;
                  }}
                >
                  Connect <ExternalLink className="ml-1 h-3 w-3" />
                </Button>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
