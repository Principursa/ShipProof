import { useState, useEffect, useCallback } from "react";
import { useAccount, useWriteContract, useReadContract, usePublicClient } from "wagmi";
import { decodeEventLog } from "viem";
import { Button } from "@ShipProof/ui/components/button";
import { Card, CardContent } from "@ShipProof/ui/components/card";
import { Check, Loader2, Circle } from "lucide-react";
import { postAttest, type AttestationEnvelope } from "@/lib/api";
import { shipProofAbi, SHIPPROOF_ADDRESS, AttestationState } from "@/lib/contracts";
import { PermitGate } from "./permit-gate";

type FlowStep = "idle" | "fetching" | "submit" | "computeScore" | "computePass" | "decrypt" | "mint" | "done" | "failed";

interface StepConfig {
  label: string;
  description: string;
}

const STEP_CONFIG: Record<FlowStep, StepConfig> = {
  idle: { label: "Ready", description: "Click to start attestation" },
  fetching: { label: "Preparing", description: "Fetching attestation envelope from oracle..." },
  submit: { label: "Submit Attestation", description: "Submitting encrypted metrics on-chain" },
  computeScore: { label: "Compute Score", description: "Computing your score on encrypted data" },
  computePass: { label: "Compute Pass", description: "Evaluating pass/fail against threshold" },
  decrypt: { label: "Request Decryption", description: "Requesting FHE decryption of result" },
  mint: { label: "Mint Badge", description: "Minting your ShipProof badge" },
  done: { label: "Complete", description: "Badge minted!" },
  failed: { label: "Failed", description: "Score below threshold" },
};

const STEP_ORDER: FlowStep[] = ["submit", "computeScore", "computePass", "decrypt", "mint"];

interface SavedState {
  attestationId: string;
  step: FlowStep;
}

function loadSavedState(): SavedState | null {
  try {
    const raw = localStorage.getItem("shipproof_attestation");
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveState(state: SavedState) {
  localStorage.setItem("shipproof_attestation", JSON.stringify(state));
}

function clearState() {
  localStorage.removeItem("shipproof_attestation");
}

export function AttestationStepper({ onComplete }: { onComplete?: (attestationId: `0x${string}`) => void } = {}) {
  const { address } = useAccount();
  const publicClient = usePublicClient();
  const [step, setStep] = useState<FlowStep>("idle");
  const [attestationId, setAttestationId] = useState<`0x${string}` | null>(null);
  const [envelope, setEnvelope] = useState<AttestationEnvelope | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { writeContractAsync } = useWriteContract();

  // Recover state on mount
  useEffect(() => {
    const saved = loadSavedState();
    if (saved && saved.attestationId) {
      setAttestationId(saved.attestationId as `0x${string}`);
      setStep(saved.step);
    }
  }, []);

  // Persist state changes
  useEffect(() => {
    if (attestationId && step !== "idle") {
      saveState({ attestationId, step });
    }
  }, [attestationId, step]);

  // Check on-chain state for recovery
  const { data: onChainState } = useReadContract({
    address: SHIPPROOF_ADDRESS,
    abi: shipProofAbi,
    functionName: "attestationState",
    args: attestationId ? [attestationId] : undefined,
    query: { enabled: !!attestationId && step !== "idle" },
  });

  // Sync step from on-chain state on recovery
  useEffect(() => {
    if (onChainState === undefined || !attestationId) return;
    const state = Number(onChainState);
    if (state === AttestationState.Submitted && step === "submit") setStep("computeScore");
    if (state === AttestationState.ScoreComputed && step === "computeScore") setStep("computePass");
    if (state === AttestationState.PassComputed && step === "computePass") setStep("decrypt");
    if (state === AttestationState.DecryptRequested && step === "decrypt") setStep("mint");
    if (state === AttestationState.BadgeMinted) { setStep("done"); clearState(); }
  }, [onChainState, attestationId, step]);

  const startAttestation = useCallback(async () => {
    setError(null);
    setStep("fetching");
    try {
      const env = await postAttest();
      setEnvelope(env);
      setStep("submit");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch envelope");
      setStep("idle");
    }
  }, []);

  const submitTx = useCallback(async () => {
    if (!envelope || !address) return;
    setError(null);
    try {
      const meta = {
        identityHash: envelope.meta.identityHash as `0x${string}`,
        fromTs: BigInt(envelope.meta.fromTs),
        toTs: BigInt(envelope.meta.toTs),
        metricCount: envelope.meta.metricCount,
        metricsVersion: envelope.meta.metricsVersion,
        scoringVersion: envelope.meta.scoringVersion,
        wallet: envelope.meta.wallet as `0x${string}`,
        oracleNonce: BigInt(envelope.meta.oracleNonce),
        expiresAt: BigInt(envelope.meta.expiresAt),
      };

      const configs = envelope.configs.map((c) => ({
        cap: c.cap,
        weight: c.weight,
      }));

      const encInputs = envelope.encryptedInputs.map((inp) => ({
        ctHash: BigInt(inp.ctHash),
        securityZone: inp.securityZone,
        utype: inp.utype,
        signature: inp.signature as `0x${string}`,
      }));

      const hash = await writeContractAsync({
        address: SHIPPROOF_ADDRESS,
        abi: shipProofAbi,
        functionName: "submitAttestation",
        args: [meta, configs, encInputs, envelope.signature as `0x${string}`],
      });

      // Wait for receipt and parse attestationId from Attested event
      const receipt = await publicClient!.waitForTransactionReceipt({ hash });
      const attestedLog = receipt.logs.find((log) => {
        try {
          const decoded = decodeEventLog({ abi: shipProofAbi, data: log.data, topics: log.topics });
          return decoded.eventName === "Attested";
        } catch { return false; }
      });
      if (!attestedLog) throw new Error("Attested event not found in receipt");
      const decoded = decodeEventLog({ abi: shipProofAbi, data: attestedLog.data, topics: attestedLog.topics });
      const id = (decoded.args as { attestationId: `0x${string}` }).attestationId;
      setAttestationId(id);
      setStep("computeScore");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Transaction failed");
    }
  }, [envelope, address, writeContractAsync, publicClient]);

  const callContractStep = useCallback(
    async (functionName: "computeScore" | "computePass" | "requestPassDecryption" | "mintBadge", nextStep: FlowStep) => {
      if (!attestationId) return;
      setError(null);
      try {
        await writeContractAsync({
          address: SHIPPROOF_ADDRESS,
          abi: shipProofAbi,
          functionName,
          args: [attestationId],
        });
        if (nextStep === "done") {
          clearState();
          if (onComplete && attestationId) onComplete(attestationId);
        }
        setStep(nextStep);
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Transaction failed";
        if (msg.includes("ScoreBelowThreshold")) {
          setStep("failed");
          clearState();
        } else {
          setError(msg);
        }
      }
    },
    [attestationId, writeContractAsync, onComplete],
  );

  const currentStepIndex = STEP_ORDER.indexOf(step);

  return (
    <Card>
      <CardContent className="space-y-4 p-6">
        <div className="space-y-3">
          {STEP_ORDER.map((s, i) => {
            const config = STEP_CONFIG[s];
            const isActive = s === step;
            const isDone = currentStepIndex > i || step === "done";
            return (
              <div key={s} className="flex items-start gap-3">
                <div className="mt-0.5">
                  {isDone ? (
                    <Check className="h-5 w-5 text-green-500" />
                  ) : isActive ? (
                    <Loader2 className="h-5 w-5 animate-spin text-primary" />
                  ) : (
                    <Circle className="h-5 w-5 text-muted-foreground" />
                  )}
                </div>
                <div>
                  <p className={`text-sm font-medium ${isActive ? "text-primary" : isDone ? "text-green-500" : "text-muted-foreground"}`}>
                    {config.label}
                  </p>
                  {isActive && (
                    <p className="text-xs text-muted-foreground">{config.description}</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {step === "done" && (
          <p className="text-center text-sm text-green-500 font-medium">
            Badge minted! View your badge to share your proof.
          </p>
        )}

        {step === "failed" && (
          <p className="text-center text-sm text-destructive font-medium">
            Score below threshold. Keep building!
          </p>
        )}

        {error && (
          <p className="text-sm text-destructive">{error}</p>
        )}

        <div className="flex justify-center pt-2">
          {step === "idle" && (
            <Button onClick={startAttestation} disabled={!address}>
              Generate Score
            </Button>
          )}
          {step === "fetching" && (
            <Button disabled>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Preparing...
            </Button>
          )}
          {step === "submit" && (
            <Button onClick={submitTx}>
              Submit Attestation (Tx 1/5)
            </Button>
          )}
          {step === "computeScore" && (
            <Button onClick={() => callContractStep("computeScore", "computePass")}>
              Compute Score (Tx 2/5)
            </Button>
          )}
          {step === "computePass" && (
            <Button onClick={() => callContractStep("computePass", "decrypt")}>
              Compute Pass (Tx 3/5)
            </Button>
          )}
          {step === "decrypt" && (
            <PermitGate action="decrypting your result">
              <Button onClick={() => callContractStep("requestPassDecryption", "mint")}>
                Reveal Result (Tx 4/5)
              </Button>
            </PermitGate>
          )}
          {step === "mint" && (
            <Button onClick={() => callContractStep("mintBadge", "done")}>
              Mint Badge (Tx 5/5)
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
