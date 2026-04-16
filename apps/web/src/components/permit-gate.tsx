import { useCofheActivePermit, useCofheAllPermits, useCofheSelectPermit, useCofheRemovePermit, useCofheNavigateToCreatePermit, useCofheConnection } from "@cofhe/react";
import type { Permit } from "@cofhe/sdk/permits";
import { Button } from "@ShipProof/ui/components/button";
import { Key, RefreshCw } from "lucide-react";

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
  children: React.ReactNode;
  action?: string;
}

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
    <div className="border border-dashed border-border p-4 space-y-3">
      {status === "disconnected" && (
        <div className="flex items-start gap-2 text-muted-foreground">
          <Key className="h-4 w-4 mt-0.5 shrink-0" />
          <p className="font-mono text-xs">Connect your wallet to manage FHE permits.</p>
        </div>
      )}

      {status === "missing" && (
        <>
          <div className="flex items-start gap-2">
            <Key className="h-4 w-4 mt-0.5 shrink-0 text-primary/60" />
            <div>
              <p className="font-mono text-xs font-medium">Permit required</p>
              <p className="font-mono text-[10px] text-muted-foreground mt-0.5">
                A CoFHE permit authorizes decryption of your encrypted data. Required for {action}.
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button size="xs" onClick={() => navigateToCreate({})} className="font-mono text-[10px] uppercase tracking-wider">
              Create Permit
            </Button>
            {allPermits.length > 0 && (
              <Button size="xs" variant="outline" onClick={() => selectPermit(allPermits[0].hash)} className="font-mono text-[10px] uppercase tracking-wider">
                Use Existing ({allPermits.length})
              </Button>
            )}
          </div>
        </>
      )}

      {status === "expired" && (
        <>
          <div className="flex items-start gap-2">
            <RefreshCw className="h-4 w-4 mt-0.5 shrink-0 text-destructive/60" />
            <div>
              <p className="font-mono text-xs font-medium text-destructive">Permit expired</p>
              <p className="font-mono text-[10px] text-muted-foreground mt-0.5">
                Your active permit has expired. Create a new one to continue with {action}.
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button size="xs" onClick={() => navigateToCreate({})} className="font-mono text-[10px] uppercase tracking-wider">
              Create New Permit
            </Button>
            {active?.permit && (
              <Button size="xs" variant="ghost" onClick={() => removePermit(active.permit.hash)} className="font-mono text-[10px] uppercase tracking-wider">
                Remove Expired
              </Button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
