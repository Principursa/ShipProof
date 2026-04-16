import { useState, useEffect, useCallback } from "react";
import { useAccount, useWriteContract, useReadContract, usePublicClient } from "wagmi";
import { decodeEventLog } from "viem";
import { Button } from "@ShipProof/ui/components/button";
import { Check, Loader2 } from "lucide-react";
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
  submit: { label: "Submit", description: "Submit encrypted metrics on-chain" },
  computeScore: { label: "Score", description: "Compute score on encrypted data" },
  computePass: { label: "Pass", description: "Evaluate against threshold" },
  decrypt: { label: "Decrypt", description: "Request FHE decryption" },
  mint: { label: "Mint", description: "Mint your soulbound badge" },
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

  useEffect(() => {
    const saved = loadSavedState();
    if (saved && saved.attestationId) {
      setAttestationId(saved.attestationId as `0x${string}`);
      setStep(saved.step);
    }
  }, []);

  useEffect(() => {
    if (attestationId && step !== "idle") {
      saveState({ attestationId, step });
    }
  }, [attestationId, step]);

  const { data: onChainState } = useReadContract({
    address: SHIPPROOF_ADDRESS,
    abi: shipProofAbi,
    functionName: "attestationState",
    args: attestationId ? [attestationId] : undefined,
    query: { enabled: !!attestationId && step !== "idle" },
  });

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
    <div className="space-y-4">
      {/* Progress bar */}
      <div className="flex items-center gap-1">
        {STEP_ORDER.map((s, i) => {
          const isDone = currentStepIndex > i || step === "done";
          const isActive = s === step;
          return (
            <div key={s} className="flex flex-1 flex-col gap-1.5">
              <div
                className={`h-1 w-full transition-colors ${
                  isDone ? "bg-primary" : isActive ? "bg-primary/40" : "bg-border"
                }`}
              />
              <span className={`font-mono text-[10px] uppercase tracking-wider ${
                isDone ? "text-primary" : isActive ? "text-foreground" : "text-muted-foreground/50"
              }`}>
                {STEP_CONFIG[s].label}
              </span>
            </div>
          );
        })}
      </div>

      {/* Active step description */}
      {step !== "idle" && step !== "done" && step !== "failed" && (
        <p className="text-xs text-muted-foreground">
          {STEP_CONFIG[step].description}
        </p>
      )}

      {step === "done" && (
        <div className="flex items-center gap-2 border border-primary/20 bg-accent/30 p-3">
          <Check className="h-4 w-4 text-primary" />
          <span className="font-mono text-xs font-medium text-primary">
            Badge minted — view your proof to share selectively.
          </span>
        </div>
      )}

      {step === "failed" && (
        <div className="border border-destructive/20 bg-destructive/5 p-3">
          <span className="font-mono text-xs text-destructive">
            Score below threshold. Keep building and try again.
          </span>
        </div>
      )}

      {error && (
        <p className="font-mono text-xs text-destructive">{error}</p>
      )}

      {/* Action button */}
      <div>
        {step === "idle" && (
          <Button onClick={startAttestation} disabled={!address} className="w-full font-mono text-xs uppercase tracking-wider">
            Generate Score
          </Button>
        )}
        {step === "fetching" && (
          <Button disabled className="w-full font-mono text-xs uppercase tracking-wider">
            <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> Preparing…
          </Button>
        )}
        {step === "submit" && (
          <Button onClick={submitTx} className="w-full font-mono text-xs uppercase tracking-wider">
            Submit Attestation
            <span className="ml-auto text-[10px] opacity-60">1/5</span>
          </Button>
        )}
        {step === "computeScore" && (
          <Button onClick={() => callContractStep("computeScore", "computePass")} className="w-full font-mono text-xs uppercase tracking-wider">
            Compute Score
            <span className="ml-auto text-[10px] opacity-60">2/5</span>
          </Button>
        )}
        {step === "computePass" && (
          <Button onClick={() => callContractStep("computePass", "decrypt")} className="w-full font-mono text-xs uppercase tracking-wider">
            Compute Pass
            <span className="ml-auto text-[10px] opacity-60">3/5</span>
          </Button>
        )}
        {step === "decrypt" && (
          <PermitGate action="decrypting your result">
            <Button onClick={() => callContractStep("requestPassDecryption", "mint")} className="w-full font-mono text-xs uppercase tracking-wider">
              Reveal Result
              <span className="ml-auto text-[10px] opacity-60">4/5</span>
            </Button>
          </PermitGate>
        )}
        {step === "mint" && (
          <Button onClick={() => callContractStep("mintBadge", "done")} className="w-full font-mono text-xs uppercase tracking-wider">
            Mint Badge
            <span className="ml-auto text-[10px] opacity-60">5/5</span>
          </Button>
        )}
      </div>
    </div>
  );
}
