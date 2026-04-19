import { useState, useEffect, useCallback, useRef } from "react";
import { useAccount, useWriteContract, useSwitchChain } from "wagmi";
import { createPublicClient, http, toEventSelector } from "viem";
import { arbitrumSepolia } from "wagmi/chains";
import { Button } from "@ShipProof/ui/components/button";
import { Check, Loader2, AlertCircle } from "lucide-react";
import { postAttest, type AttestationEnvelope } from "@/lib/api";
import { shipProofAbi, SHIPPROOF_ADDRESS, AttestationState } from "@/lib/contracts";
import { friendlyError } from "@/lib/errors";
import { env } from "@ShipProof/env/web";
import { useCofheClient, useCofheActivePermit } from "@cofhe/react";
import { PermitGate } from "./permit-gate";
import { SelectiveDisclosure } from "./selective-disclosure";

/** Dedicated Arbitrum Sepolia client — never affected by wallet chain state */
const arbSepoliaClient = createPublicClient({
  chain: arbitrumSepolia,
  transport: http(env.VITE_ARB_SEPOLIA_RPC_URL),
});

type FlowStep = "idle" | "fetching" | "submit" | "computeScore" | "computePass" | "decrypt" | "mint" | "done" | "failed";

const STEP_META: Record<string, { label: string; desc: string }> = {
  submit: { label: "Submit", desc: "Sending encrypted metrics" },
  computeScore: { label: "Score", desc: "FHE scoring on-chain" },
  computePass: { label: "Pass", desc: "Threshold check" },
  decrypt: { label: "Decrypt", desc: "Decrypting and publishing result" },
  mint: { label: "Mint", desc: "Minting soulbound badge" },
};

const STEP_ORDER: FlowStep[] = ["submit", "computeScore", "computePass", "decrypt", "mint"];

interface SavedState { attestationId: string; step: FlowStep; wallet?: string; }

function loadSavedState(wallet: string | undefined): SavedState | null {
  try {
    const raw = localStorage.getItem("shipproof_attestation");
    if (!raw) return null;
    const saved: SavedState = JSON.parse(raw);
    if (saved.wallet && saved.wallet !== wallet) return null;
    return saved;
  } catch { return null; }
}
function saveState(state: SavedState) { localStorage.setItem("shipproof_attestation", JSON.stringify(state)); }
function clearState() { localStorage.removeItem("shipproof_attestation"); }

export function AttestationStepper({ onComplete }: { onComplete?: (attestationId: `0x${string}`) => void } = {}) {
  const { address, chainId } = useAccount();
  const [step, setStep] = useState<FlowStep>("idle");
  const [attestationId, setAttestationId] = useState<`0x${string}` | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const { writeContractAsync } = useWriteContract();
  const { switchChainAsync } = useSwitchChain();
  const cofheClient = useCofheClient();
  const activePermit = useCofheActivePermit();
  const abortRef = useRef(false);

  const ensureChain = useCallback(async () => {
    if (chainId !== arbitrumSepolia.id) {
      await switchChainAsync({ chainId: arbitrumSepolia.id });
    }
  }, [chainId, switchChainAsync]);

  // Restore saved state on wallet change
  useEffect(() => {
    const saved = loadSavedState(address);
    if (saved?.attestationId) {
      setAttestationId(saved.attestationId as `0x${string}`);
      setStep(saved.step);
    } else {
      setAttestationId(null);
      setStep("idle");
    }
  }, [address]);

  // Save state on changes
  useEffect(() => {
    if (attestationId && step !== "idle" && address) {
      saveState({ attestationId, step, wallet: address });
    }
  }, [attestationId, step, address]);

  /** Execute a single contract step and wait for confirmation */
  const execStep = useCallback(async (
    functionName: "computeScore" | "computePass" | "requestPassDecryption" | "mintBadge",
    aid: `0x${string}`,
  ) => {
    await ensureChain();
    const hash = await writeContractAsync({
      chainId: arbitrumSepolia.id,
      address: SHIPPROOF_ADDRESS,
      abi: shipProofAbi,
      functionName,
      args: [aid],
    });
    await arbSepoliaClient.waitForTransactionReceipt({ hash, confirmations: 1 });
  }, [ensureChain, writeContractAsync]);

  /** Run the full attestation flow from current step */
  const runFlow = useCallback(async (startStep: FlowStep, envelope: AttestationEnvelope | null, aid: `0x${string}` | null) => {
    if (!address) return;
    abortRef.current = false;
    setRunning(true);
    setError(null);

    try {
      await ensureChain();

      // Step 1: Submit attestation (if not already done)
      if (startStep === "fetching" || startStep === "submit") {
        if (!envelope) {
          setStep("fetching");
          envelope = await postAttest();
        }

        setStep("submit");
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
        const configs = envelope.configs.map((c) => ({ cap: c.cap, weight: c.weight }));
        const encInputs = envelope.encryptedInputs.map((inp) => ({
          ctHash: BigInt(inp.ctHash),
          securityZone: inp.securityZone,
          utype: inp.utype,
          signature: inp.signature as `0x${string}`,
        }));

        const hash = await writeContractAsync({
          chainId: arbitrumSepolia.id,
          address: SHIPPROOF_ADDRESS,
          abi: shipProofAbi,
          functionName: "submitAttestation",
          args: [meta, configs, encInputs, envelope.signature as `0x${string}`],
        });

        const receipt = await arbSepoliaClient.waitForTransactionReceipt({ hash, confirmations: 2 });
        if (receipt.status === "reverted") throw new Error("Transaction reverted on-chain");

        const ATTESTED_TOPIC = toEventSelector("Attested(bytes32,address,uint8,uint32,uint32)");
        let attestedLog = receipt.logs.find((log) => log.topics[0] === ATTESTED_TOPIC);
        if (!attestedLog) {
          const retryReceipt = await arbSepoliaClient.getTransactionReceipt({ hash });
          attestedLog = retryReceipt.logs.find((log) => log.topics[0] === ATTESTED_TOPIC);
        }
        if (!attestedLog?.topics[1]) throw new Error("Transaction confirmed but no attestation event found");

        aid = attestedLog.topics[1] as `0x${string}`;
        setAttestationId(aid);
        startStep = "computeScore";
      }

      if (!aid) throw new Error("No attestation ID");
      if (abortRef.current) return;

      // Step 2: Compute Score
      if (startStep === "computeScore") {
        setStep("computeScore");
        await execStep("computeScore", aid);
        startStep = "computePass";
      }

      if (abortRef.current) return;

      // Step 3: Compute Pass
      if (startStep === "computePass") {
        setStep("computePass");
        await execStep("computePass", aid);
        startStep = "decrypt";
      }

      if (abortRef.current) return;

      // Step 4: Decrypt & Publish Result
      if (startStep === "decrypt") {
        setStep("decrypt");

        // 1. Read the encrypted pass handle from the contract
        const encPassedHandle = await arbSepoliaClient.readContract({
          address: SHIPPROOF_ADDRESS,
          abi: shipProofAbi,
          functionName: "getEncPassed",
          args: [aid],
        });

        // 2. Get signed decrypt result from CoFHE coprocessor (requires active permit)
        // Retry on 428 (Precondition Required) — coprocessor may need time after computePass
        let decryptedValue: string | bigint = 0n;
        let decryptSig: string = "0x";
        for (let attempt = 0; attempt < 12; attempt++) {
          try {
            const builder = cofheClient.decryptForTx(encPassedHandle as string);
            if (activePermit?.permit) {
              builder.withPermit(activePermit.permit.hash);
            } else {
              builder.withPermit();
            }
            const result = await builder.execute();
            decryptedValue = result.decryptedValue;
            decryptSig = result.signature;
            break;
          } catch (e) {
            const msg = String(e);
            if ((msg.includes("428") || msg.includes("Precondition")) && attempt < 11) {
              console.log(`[ShipProof] CoFHE not ready, retrying decrypt in 5s (attempt ${attempt + 1}/12)`);
              await new Promise((r) => setTimeout(r, 5000));
              continue;
            }
            throw e;
          }
        }

        // 3. Publish on-chain
        await ensureChain();
        const pubHash = await writeContractAsync({
          chainId: arbitrumSepolia.id,
          address: SHIPPROOF_ADDRESS,
          abi: shipProofAbi,
          functionName: "publishPassDecryptResult",
          args: [aid, BigInt(decryptedValue) > 0n, decryptSig as `0x${string}`],
        });
        await arbSepoliaClient.waitForTransactionReceipt({ hash: pubHash, confirmations: 1 });

        startStep = "mint";
      }

      if (abortRef.current) return;

      // Step 5: Mint Badge
      if (startStep === "mint") {
        setStep("mint");
        await execStep("mintBadge", aid);
      }

      // Verify badge actually exists on-chain before claiming success
      const minted = await arbSepoliaClient.readContract({
        address: SHIPPROOF_ADDRESS,
        abi: shipProofAbi,
        functionName: "badgeMinted",
        args: [aid],
      });
      if (!minted) {
        throw new Error("Mint transaction succeeded but badge not found on-chain. Try again.");
      }

      // Done
      setStep("done");
      clearState();
      onComplete?.(aid);

    } catch (err) {
      console.error("[ShipProof] flow error:", err);
      const errStr = String(err);
      const isBelowThreshold = errStr.includes("ScoreBelowThreshold") ||
        errStr.includes("0x5b77f0d3") ||
        errStr.includes("Score below threshold");
      if (isBelowThreshold) {
        setStep("failed");
        clearState();
      } else {
        setError(friendlyError(err));
        // Step stays at current position so user can retry from there
      }
    } finally {
      setRunning(false);
    }
  }, [address, ensureChain, writeContractAsync, execStep, onComplete, cofheClient]);

  /** Start fresh or resume from current step */
  const handleStart = useCallback(() => {
    if (step === "idle") {
      runFlow("fetching", null, null);
    } else if (attestationId && !running) {
      // Resume from current step
      runFlow(step, null, attestationId);
    }
  }, [step, attestationId, running, runFlow]);

  const currentStepIndex = STEP_ORDER.indexOf(step);
  const activeStepMeta = STEP_META[step];

  return (
    <div className="space-y-5">
      {/* Step indicator dots */}
      <div className="flex items-center gap-2">
        {STEP_ORDER.map((s, i) => {
          const isDone = currentStepIndex > i || step === "done";
          const isActive = s === step && running;
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
                ) : isActive ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
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

      {/* Preparing envelope */}
      {running && step === "fetching" && (
        <div className="flex items-center gap-3 border border-border/50 bg-accent/20 p-3">
          <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
          <div>
            <p className="font-mono text-[11px] text-foreground">
              Preparing your attestation
            </p>
            <p className="font-mono text-[9px] text-muted-foreground">
              Fetching metrics and encrypting — this may take a few seconds
            </p>
          </div>
        </div>
      )}

      {/* Progress message while running on-chain steps */}
      {running && activeStepMeta && step !== "fetching" && (
        <div className="flex items-center gap-3 border border-border/50 bg-accent/20 p-3">
          <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
          <div>
            <p className="font-mono text-[11px] text-foreground">
              {activeStepMeta.desc}
            </p>
            <p className="font-mono text-[9px] text-muted-foreground">
              {step === "decrypt" ? "Requesting CoFHE decryption" : "Approve the transaction in your wallet"}
            </p>
          </div>
          <span className="ml-auto font-mono text-[9px] text-muted-foreground/50">
            {currentStepIndex + 1}/5
          </span>
        </div>
      )}

      {/* Done */}
      {step === "done" && (
        <div className="space-y-4 animate-stamp">
          <div className="flex items-center gap-3 border-2 border-primary/20 bg-accent/40 p-4">
            <img src="/logo.png" alt="" className="h-8 w-auto" />
            <div>
              <p className="font-serif text-sm font-medium text-foreground">
                Badge minted
              </p>
              <p className="font-mono text-[10px] text-muted-foreground">
                Share your badge with a verifier to complete the loop.
              </p>
            </div>
          </div>
          {attestationId && (
            <SelectiveDisclosure
              attestationId={attestationId}
              metricCount={8}
            />
          )}
        </div>
      )}

      {/* Failed */}
      {step === "failed" && (
        <div className="border border-destructive/20 bg-destructive/5 p-4">
          <p className="font-serif text-sm text-destructive">Below threshold</p>
          <p className="font-mono text-[10px] text-muted-foreground">Keep building and try again.</p>
        </div>
      )}

      {/* Error with retry */}
      {error && (
        <div className="flex items-start gap-2 border border-destructive/20 bg-destructive/5 p-3">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-destructive" />
          <div className="flex-1">
            <p className="font-mono text-[11px] text-destructive">{error}</p>
            <p className="mt-1 font-mono text-[9px] text-muted-foreground">
              Click below to retry from this step.
            </p>
          </div>
        </div>
      )}

      {/* Single action button */}
      {step === "idle" && (
        <Button onClick={handleStart} disabled={!address || running} className="w-full font-mono text-[11px] uppercase tracking-[0.15em]">
          Begin Attestation
        </Button>
      )}

      {/* Resume button — shown when stopped mid-flow (error or page reload) */}
      {!running && step !== "idle" && step !== "done" && step !== "failed" && step !== "fetching" && (
        <PermitGate action="completing your attestation">
          <Button onClick={handleStart} className="w-full font-mono text-[11px] uppercase tracking-[0.15em]">
            {error ? "Retry" : "Resume"} — {STEP_META[step]?.label ?? step}
            <span className="ml-auto font-mono text-[9px] opacity-40">
              Tx {currentStepIndex + 1}/5
            </span>
          </Button>
        </PermitGate>
      )}
    </div>
  );
}
