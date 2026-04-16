import { useCofheActivePermit, useCofheAllPermits, useCofheSelectPermit, useCofheRemovePermit, useCofheNavigateToCreatePermit, useCofheConnection } from "@cofhe/react";
import type { Permit } from "@cofhe/sdk/permits";
import { Button } from "@ShipProof/ui/components/button";
import { Card, CardContent } from "@ShipProof/ui/components/card";
import { AlertTriangle, Key, RefreshCw, ShieldCheck } from "lucide-react";

type PermitGateStatus = "ready" | "missing" | "expired" | "disconnected";

function getPermitStatus(active: { permit: Permit; isValid: boolean } | undefined, connected: boolean): PermitGateStatus {
  if (!connected) return "disconnected";
  if (!active) return "missing";
  if (active.permit.expiration && active.permit.expiration < Math.floor(Date.now() / 1000)) {
    return "expired";
  }
  if (!active.isValid) return "expired";
  return "ready";
}

interface PermitGateProps {
  /** Render children only when a valid permit is active */
  children: React.ReactNode;
  /** What action the permit is needed for (shown in UI) */
  action?: string;
}

/**
 * Gates decrypt-facing actions behind a valid CoFHE permit.
 * Shows create/select/expired/missing states with clear CTAs.
 */
export function PermitGate({ children, action = "this action" }: PermitGateProps) {
  const active = useCofheActivePermit();
  const allPermits = useCofheAllPermits();
  const selectPermit = useCofheSelectPermit({});
  const removePermit = useCofheRemovePermit({});
  const navigateToCreate = useCofheNavigateToCreatePermit();
  const connection = useCofheConnection();

  const status = getPermitStatus(active, connection.connected);

  if (status === "ready") {
    return <>{children}</>;
  }

  return (
    <Card className="border-dashed">
      <CardContent className="p-4 space-y-3">
        {status === "disconnected" && (
          <div className="flex items-start gap-2 text-muted-foreground">
            <Key className="h-4 w-4 mt-0.5 shrink-0" />
            <p className="text-sm">Connect your wallet to manage FHE permits.</p>
          </div>
        )}

        {status === "missing" && (
          <>
            <div className="flex items-start gap-2">
              <Key className="h-4 w-4 mt-0.5 shrink-0 text-amber-500" />
              <div className="text-sm">
                <p className="font-medium">Permit required</p>
                <p className="text-muted-foreground">
                  A CoFHE permit authorizes decryption of your encrypted data. Create one to proceed with {action}.
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={() => navigateToCreate({})}>
                <ShieldCheck className="mr-1.5 h-3.5 w-3.5" />
                Create Permit
              </Button>
              {allPermits.length > 0 && (
                <Button size="sm" variant="outline" onClick={() => selectPermit(allPermits[0].hash)}>
                  Use Existing ({allPermits.length})
                </Button>
              )}
            </div>
          </>
        )}

        {status === "expired" && (
          <>
            <div className="flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0 text-destructive" />
              <div className="text-sm">
                <p className="font-medium text-destructive">Permit expired</p>
                <p className="text-muted-foreground">
                  Your active permit has expired. Create a new one to continue with {action}.
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={() => navigateToCreate({})}>
                <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
                Create New Permit
              </Button>
              {active?.permit && (
                <Button size="sm" variant="ghost" onClick={() => removePermit(active.permit.hash)}>
                  Remove Expired
                </Button>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
