import { useState, useEffect, useCallback } from "react";
import { useAccount, useWriteContract, useReadContract, useSwitchChain } from "wagmi";
import { createPublicClient, http, toEventSelector } from "viem";
import { arbitrumSepolia } from "wagmi/chains";
import { Button } from "@ShipProof/ui/components/button";
import { Check, Loader2 } from "lucide-react";
import { postAttest, type AttestationEnvelope } from "@/lib/api";
import { shipProofAbi, SHIPPROOF_ADDRESS, AttestationState } from "@/lib/contracts";
import { env } from "@ShipProof/env/web";
import { PermitGate } from "./permit-gate";

/** Dedicated Arbitrum Sepolia client — never affected by wallet chain state */
const arbSepoliaClient = createPublicClient({
  chain: arbitrumSepolia,
  transport: http(env.VITE_ARB_SEPOLIA_RPC_URL),
});

/** Extract a short, user-friendly message from viem/wagmi errors. */
function friendlyError(err: unknown): string {
  if (!(err instanceof Error)) return "Transaction failed";
  const msg = err.message;
  if (msg.includes("User rejected")) return "Transaction rejected";
  if (msg.includes("User denied")) return "Transaction rejected";
  if (msg.includes("ScoreBelowThreshold")) return "Score below threshold";
  if (msg.includes("NonceAlreadyUsed")) return "Attestation already submitted — nonce reused";
  if (msg.includes("AttestationExpired")) return "Attestation expired — please retry";
  if (msg.includes("InvalidSignature")) return "Invalid oracle signature";
  if (msg.includes("insufficient funds")) return "Insufficient funds for gas";
  // Fallback: take first line only, strip technical details
  const firstLine = msg.split("\n")[0] ?? msg;
  if (firstLine.length > 120) return firstLine.slice(0, 120) + "…";
  return firstLine;
}

type FlowStep = "idle" | "fetching" | "submit" | "computeScore" | "computePass" | "decrypt" | "mint" | "done" | "failed";

const STEP_META: Record<string, { label: string; desc: string }> = {
  submit: { label: "Submit", desc: "Encrypted metrics on-chain" },
  computeScore: { label: "Score", desc: "FHE computation" },
  computePass: { label: "Pass", desc: "Threshold check" },
  decrypt: { label: "Decrypt", desc: "Reveal result" },
  mint: { label: "Mint", desc: "Soulbound badge" },
};

const STEP_ORDER: FlowStep[] = ["submit", "computeScore", "computePass", "decrypt", "mint"];

interface SavedState { attestationId: string; step: FlowStep; }

function loadSavedState(): SavedState | null {
  try { const raw = localStorage.getItem("shipproof_attestation"); return raw ? JSON.parse(raw) : null; } catch { return null; }
}
function saveState(state: SavedState) { localStorage.setItem("shipproof_attestation", JSON.stringify(state)); }
function clearState() { localStorage.removeItem("shipproof_attestation"); }

export function AttestationStepper({ onComplete }: { onComplete?: (attestationId: `0x${string}`) => void } = {}) {
  const { address, chainId } = useAccount();
  const [step, setStep] = useState<FlowStep>("idle");
  const [attestationId, setAttestationId] = useState<`0x${string}` | null>(null);
  const [envelope, setEnvelope] = useState<AttestationEnvelope | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { writeContractAsync } = useWriteContract();
  const { switchChainAsync } = useSwitchChain();

  const ensureChain = useCallback(async () => {
    if (chainId !== arbitrumSepolia.id) {
      await switchChainAsync({ chainId: arbitrumSepolia.id });
    }
  }, [chainId, switchChainAsync]);

  useEffect(() => { const saved = loadSavedState(); if (saved?.attestationId) { setAttestationId(saved.attestationId as `0x${string}`); setStep(saved.step); } }, []);
  useEffect(() => { if (attestationId && step !== "idle") saveState({ attestationId, step }); }, [attestationId, step]);

  const { data: onChainState } = useReadContract({
    address: SHIPPROOF_ADDRESS, abi: shipProofAbi, functionName: "attestationState",
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
    setError(null); setStep("fetching");
    try { const env = await postAttest(); setEnvelope(env); setStep("submit"); }
    catch (err) { setError(err instanceof Error ? err.message : "Failed to fetch envelope"); setStep("idle"); }
  }, []);

  const submitTx = useCallback(async () => {
    if (!envelope || !address) return;
    setError(null);
    try {
      await ensureChain();
      const meta = { identityHash: envelope.meta.identityHash as `0x${string}`, fromTs: BigInt(envelope.meta.fromTs), toTs: BigInt(envelope.meta.toTs), metricCount: envelope.meta.metricCount, metricsVersion: envelope.meta.metricsVersion, scoringVersion: envelope.meta.scoringVersion, wallet: envelope.meta.wallet as `0x${string}`, oracleNonce: BigInt(envelope.meta.oracleNonce), expiresAt: BigInt(envelope.meta.expiresAt) };
      const configs = envelope.configs.map((c) => ({ cap: c.cap, weight: c.weight }));
      const encInputs = envelope.encryptedInputs.map((inp) => ({ ctHash: BigInt(inp.ctHash), securityZone: inp.securityZone, utype: inp.utype, signature: inp.signature as `0x${string}` }));
      const hash = await writeContractAsync({ chainId: arbitrumSepolia.id, address: SHIPPROOF_ADDRESS, abi: shipProofAbi, functionName: "submitAttestation", args: [meta, configs, encInputs, envelope.signature as `0x${string}`] });
      console.log("[ShipProof] tx hash:", hash);
      const receipt = await arbSepoliaClient.waitForTransactionReceipt({ hash, confirmations: 2 });
      console.log("[ShipProof] receipt status:", receipt.status, "logs:", receipt.logs.length, "blockNumber:", receipt.blockNumber.toString());
      if (receipt.status === "reverted") {
        setError("Transaction reverted on-chain");
        return;
      }
      // Find Attested event — match by topic0
      const ATTESTED_TOPIC = toEventSelector("Attested(bytes32,address,uint8,uint32,uint32)");
      const attestedLog = receipt.logs.find((log) => log.topics[0] === ATTESTED_TOPIC);
      if (attestedLog?.topics[1]) {
        setAttestationId(attestedLog.topics[1] as `0x${string}`);
        setStep("computeScore");
      } else {
        // Fallback: fetch receipt again via RPC in case logs were missing
        console.warn("[ShipProof] No Attested log found, retrying receipt fetch...");
        const retryReceipt = await arbSepoliaClient.getTransactionReceipt({ hash });
        console.log("[ShipProof] retry receipt logs:", retryReceipt.logs.length);
        const retryLog = retryReceipt.logs.find((log) => log.topics[0] === ATTESTED_TOPIC);
        if (retryLog?.topics[1]) {
          setAttestationId(retryLog.topics[1] as `0x${string}`);
          setStep("computeScore");
        } else {
          console.warn("[ShipProof] Full retry receipt:", JSON.stringify(retryReceipt, (_, v) => typeof v === "bigint" ? v.toString() : v));
          setError("Transaction confirmed but no events emitted — tx may have reverted internally");
        }
      }
    } catch (err) { console.error(err); setError(friendlyError(err)); }
  }, [envelope, address, ensureChain, writeContractAsync]);

  const callContractStep = useCallback(async (functionName: "computeScore" | "computePass" | "requestPassDecryption" | "mintBadge", nextStep: FlowStep) => {
    if (!attestationId) return;
    setError(null);
    try {
      await ensureChain();
      await writeContractAsync({ chainId: arbitrumSepolia.id, address: SHIPPROOF_ADDRESS, abi: shipProofAbi, functionName, args: [attestationId] });
      if (nextStep === "done") { clearState(); onComplete?.(attestationId); }
      setStep(nextStep);
    } catch (err) {
      console.error(err);
      const msg = friendlyError(err);
      if (msg.includes("threshold")) { setStep("failed"); clearState(); } else setError(msg);
    }
  }, [attestationId, ensureChain, writeContractAsync, onComplete]);

  const currentStepIndex = STEP_ORDER.indexOf(step);

  return (
    <div className="space-y-5">
      {/* Step indicator dots */}
      <div className="flex items-center gap-2">
        {STEP_ORDER.map((s, i) => {
          const isDone = currentStepIndex > i || step === "done";
          const isActive = s === step;
          const meta = STEP_META[s];
          return (
            <div key={s} className="flex flex-1 flex-col items-center gap-2">
              <div className={`flex h-8 w-8 items-center justify-center transition-all duration-300 ${
                isDone ? "bg-primary text-primary-foreground" :
                isActive ? "border-2 border-primary text-primary" :
                "border border-border text-muted-foreground/40"
              }`}>
                {isDone ? (
                  <Check className="h-3.5 w-3.5" />
                ) : (
                  <span className="font-mono text-[10px]">{i + 1}</span>
                )}
              </div>
              <span className={`font-mono text-[9px] uppercase tracking-wider ${
                isDone ? "text-primary" : isActive ? "text-foreground" : "text-muted-foreground/40"
              }`}>
                {meta?.label}
              </span>
            </div>
          );
        })}
      </div>

      {/* Connecting lines */}
      <div className="relative -mt-[52px] mx-4 flex">
        {STEP_ORDER.slice(0, -1).map((_, i) => {
          const isDone = currentStepIndex > i + 1 || step === "done";
          return (
            <div key={i} className="flex-1 px-4">
              <div className={`mt-4 h-px transition-colors duration-300 ${isDone ? "bg-primary" : "bg-border"}`} />
            </div>
          );
        })}
      </div>
      <div className="pt-2" />

      {/* Status messages */}
      {step === "done" && (
        <div className="flex items-center gap-3 border-2 border-primary/20 bg-accent/40 p-4 animate-stamp">
          <img src="/logo.png" alt="" className="h-8 w-auto" />
          <div>
            <p className="font-serif text-sm font-medium text-foreground">Badge minted</p>
            <p className="font-mono text-[10px] text-muted-foreground">View your proof below to share selectively.</p>
          </div>
        </div>
      )}

      {step === "failed" && (
        <div className="border border-destructive/20 bg-destructive/5 p-4">
          <p className="font-serif text-sm text-destructive">Below threshold</p>
          <p className="font-mono text-[10px] text-muted-foreground">Keep building and try again.</p>
        </div>
      )}

      {error && <p className="font-mono text-[11px] text-destructive">{error}</p>}

      {/* Action */}
      {step === "idle" && (
        <Button onClick={startAttestation} disabled={!address} className="w-full font-mono text-[11px] uppercase tracking-[0.15em]">
          Begin Attestation
        </Button>
      )}
      {step === "fetching" && (
        <Button disabled className="w-full font-mono text-[11px] uppercase tracking-[0.15em]">
          <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> Preparing…
        </Button>
      )}
      {step === "submit" && (
        <Button onClick={submitTx} className="w-full font-mono text-[11px] uppercase tracking-[0.15em]">
          Submit Attestation <span className="ml-auto font-mono text-[9px] opacity-40">Tx 1/5</span>
        </Button>
      )}
      {step === "computeScore" && (
        <Button onClick={() => callContractStep("computeScore", "computePass")} className="w-full font-mono text-[11px] uppercase tracking-[0.15em]">
          Compute Score <span className="ml-auto font-mono text-[9px] opacity-40">Tx 2/5</span>
        </Button>
      )}
      {step === "computePass" && (
        <Button onClick={() => callContractStep("computePass", "decrypt")} className="w-full font-mono text-[11px] uppercase tracking-[0.15em]">
          Compute Pass <span className="ml-auto font-mono text-[9px] opacity-40">Tx 3/5</span>
        </Button>
      )}
      {step === "decrypt" && (
        <PermitGate action="decrypting your result">
          <Button onClick={() => callContractStep("requestPassDecryption", "mint")} className="w-full font-mono text-[11px] uppercase tracking-[0.15em]">
            Reveal Result <span className="ml-auto font-mono text-[9px] opacity-40">Tx 4/5</span>
          </Button>
        </PermitGate>
      )}
      {step === "mint" && (
        <Button onClick={() => callContractStep("mintBadge", "done")} className="w-full font-mono text-[11px] uppercase tracking-[0.15em]">
          Mint Badge <span className="ml-auto font-mono text-[9px] opacity-40">Tx 5/5</span>
        </Button>
      )}
    </div>
  );
}
