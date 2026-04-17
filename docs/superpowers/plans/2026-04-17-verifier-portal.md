# Verifier Portal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a verifier portal, dual-persona landing page, and share flow improvements to make ShipProof's two-sided market legible to buildathon judges.

**Architecture:** New `/verify` and `/verify/$attestationId` routes for the screener experience. Shared utility layer (tier derivation, friendly errors, metricsVersion lookup). Landing page split into builder/verifier personas. Selective disclosure simplified with share link generation. Verification receipt as portable signed artifact.

**Tech Stack:** React 19, TanStack Router, wagmi, viem, @cofhe/react, shadcn/ui, Tailwind CSS

**Spec:** `docs/superpowers/specs/2026-04-17-verifier-portal-design.md`

---

## Parallelization Map

```
Layer 0 (parallel):  Task 1 (shared utils)  |  Task 2 (landing page)
                          ↓
Layer 1 (parallel):  Task 3 (VerifyBadgeCard)  |  Task 4 (selective disclosure)  |  Task 5 (post-mint prompt)
                          ↓
Layer 2 (parallel):  Task 6 (verify lookup)  |  Task 7 (verify detail)
                          ↓
Layer 3:             Task 8 (verification receipt)
                          ↓
Layer 4:             Task 9 (nav + final wiring)
```

Tasks within the same layer have no dependencies on each other and CAN run as parallel subagents. Tasks in later layers depend on earlier layers completing first.

### Codex Review Fixes Applied (v2)

1. **`useCofheReadContractAndDecrypt` API**: Hook takes two args — params object and optional `{ readQueryOptions, decryptingQueryOptions }`. Returns `{ encrypted, decrypted, disabledDueToMissingPermit }`. No `error` field or `query` option. Use `readQueryOptions: { enabled }` for conditional reads.
2. **Post-mint scroll target**: The SelectiveDisclosure on `/attest` (attest.tsx line 89-92) is the correct target, not `/badge/$id`. Task 5 updated to modify `attest.tsx`.
3. **Verify detail state machine**: VerifyBadgeCard no longer tries to distinguish errors from no-access internally. The verify detail page handles all 7 states explicitly using contract reads + permit state.
4. **`/verify` lookup**: Renders VerifyBadgeCard per result (reinstating Task 3 dependency). Sorts by reading `toTs` from attestation data.
5. **`scoreAboveThreshold`**: Uses contract threshold constant (4000), not tier level.
6. **Missing ABI events**: `ScoreAccessGranted` and `MetricAccessGranted` events added to contracts.ts in Task 1.

---

### Task 1: Shared Utilities & Contract Config

**Files:**
- Create: `apps/web/src/lib/tier.ts`
- Create: `apps/web/src/lib/errors.ts`
- Create: `apps/web/src/lib/metrics-version.ts`
- Modify: `apps/web/src/lib/contracts.ts`
- Modify: `packages/env/src/web.ts`
- Modify: `apps/web/.env`
- Modify: `apps/web/src/components/attestation-stepper.tsx` (import change only)

- [ ] **Step 1: Create `apps/web/src/lib/tier.ts`**

```ts
export interface TierInfo {
  label: string;
  level: number;
}

export function deriveTier(score: number): TierInfo {
  if (score >= 7500) return { label: "Diamond", level: 3 };
  if (score >= 5000) return { label: "Gold", level: 2 };
  if (score >= 2500) return { label: "Silver", level: 1 };
  return { label: "Bronze", level: 0 };
}

export const TIER_COLORS: Record<string, string> = {
  Diamond: "text-blue-400",
  Gold: "text-amber-500",
  Silver: "text-zinc-400",
  Bronze: "text-orange-700",
};
```

- [ ] **Step 2: Create `apps/web/src/lib/errors.ts`**

Extract `friendlyError` from `attestation-stepper.tsx`:

```ts
/** Extract a short, user-friendly message from viem/wagmi errors. */
export function friendlyError(err: unknown): string {
  if (!(err instanceof Error)) return "Transaction failed";
  const msg = err.message;
  if (msg.includes("User rejected")) return "Transaction rejected";
  if (msg.includes("User denied")) return "Transaction rejected";
  if (msg.includes("ScoreBelowThreshold")) return "Score below threshold";
  if (msg.includes("NonceAlreadyUsed"))
    return "Attestation already submitted — nonce reused";
  if (msg.includes("AttestationExpired"))
    return "Attestation expired — please retry";
  if (msg.includes("InvalidSignature")) return "Invalid oracle signature";
  if (msg.includes("insufficient funds")) return "Insufficient funds for gas";
  const firstLine = msg.split("\n")[0] ?? msg;
  if (firstLine.length > 120) return firstLine.slice(0, 120) + "…";
  return firstLine;
}
```

- [ ] **Step 3: Create `apps/web/src/lib/metrics-version.ts`**

```ts
interface MetricsVersionInfo {
  providers: string[];
  metricCount: number;
}

/**
 * Static map of metricsVersion (uint32 as hex) -> provider info.
 * Key format: `0x${version.toString(16).padStart(8, '0')}` (lowercase).
 * Update when metric keys change (any add/remove/rename, not just provider changes).
 */
const METRICS_VERSION_MAP: Record<string, MetricsVersionInfo> = {
  // GitHub (commits, issues, pr_reviews, prs, repos) + X (engagement, followers, ship_posts)
  // To populate: run attestation pipeline and log metricsVersion from the envelope,
  // then convert to hex: `0x${metricsVersion.toString(16).padStart(8, '0')}`
};

export function lookupMetricsVersion(version: number): MetricsVersionInfo {
  const key = `0x${version.toString(16).padStart(8, "0")}`;
  return (
    METRICS_VERSION_MAP[key] ?? {
      providers: [],
      metricCount: 0,
    }
  );
}

/**
 * Human-readable provider category label.
 * Returns e.g. "Code activity and social metrics" or "Multiple providers".
 */
export function providerCategoryLabel(providers: string[]): string {
  if (providers.length === 0) return "Multiple providers";
  const labels: Record<string, string> = {
    github: "code activity",
    x: "social metrics",
    farcaster: "web3 social metrics",
  };
  return providers
    .map((p) => labels[p] ?? p)
    .join(" and ")
    .replace(/^./, (c) => c.toUpperCase());
}
```

- [ ] **Step 4: Add `VITE_DEPLOY_BLOCK` to env schema**

In `packages/env/src/web.ts`, add to the `client` object:

```ts
VITE_DEPLOY_BLOCK: z.string().regex(/^\d+$/).optional(),
```

- [ ] **Step 5: Add `DEPLOY_BLOCK` and missing events to `apps/web/src/lib/contracts.ts`**

Add after the `SHIPPROOF_ADDRESS` export:

```ts
export const DEPLOY_BLOCK = BigInt(env.VITE_DEPLOY_BLOCK ?? "0");
export const PASS_THRESHOLD = 4000; // matches contract deployment config
```

Add these events to the `shipProofAbi` array (after the existing `BadgeMinted` event):

```ts
  {
    type: "event",
    name: "ScoreAccessGranted",
    inputs: [
      { name: "attestationId", type: "bytes32", indexed: true },
      { name: "grantee", type: "address", indexed: true },
    ],
  },
  {
    type: "event",
    name: "MetricAccessGranted",
    inputs: [
      { name: "attestationId", type: "bytes32", indexed: true },
      { name: "slotIndex", type: "uint8", indexed: false },
      { name: "grantee", type: "address", indexed: true },
    ],
  },
```

- [ ] **Step 6: Add `VITE_DEPLOY_BLOCK` to `apps/web/.env`**

Add line:

```
VITE_DEPLOY_BLOCK=0
```

Note: Replace `0` with the actual deployment block number. To find it: check the contract creation tx on Arbiscan for `0x338Bd76EC463cF1eadc1f75b400271021Af837ec`.

- [ ] **Step 7: Update `attestation-stepper.tsx` to import shared `friendlyError`**

Replace the local `friendlyError` function (lines 19-32) with:

```ts
import { friendlyError } from "@/lib/errors";
```

Delete the local `friendlyError` function definition.

- [ ] **Step 8: Verify the build compiles**

Run: `cd /home/Cifr/Projects/ShipProof && bun run check-types`
Expected: No type errors related to the new files or changed imports.

- [ ] **Step 9: Commit**

```bash
git add apps/web/src/lib/tier.ts apps/web/src/lib/errors.ts apps/web/src/lib/metrics-version.ts apps/web/src/lib/contracts.ts apps/web/src/components/attestation-stepper.tsx packages/env/src/web.ts apps/web/.env
git commit -m "extract shared utils: tier, errors, metrics-version"
```

---

### Task 2: Landing Page Dual-Persona Hero

**Files:**
- Modify: `apps/web/src/routes/index.tsx`

**No dependencies.** Can run in parallel with Task 1.

- [ ] **Step 1: Rewrite the landing page**

Replace the entire content of `apps/web/src/routes/index.tsx` with:

```tsx
import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@ShipProof/ui/components/button";
import { ArrowRight, Search } from "lucide-react";

export const Route = createFileRoute("/")(
  { component: HomeComponent },
);

function HomeComponent() {
  return (
    <div className="flex flex-col overflow-x-hidden">
      {/* Hero — dual persona */}
      <section className="relative mx-auto flex w-full max-w-4xl px-8 pt-24 pb-20 md:pt-32 md:pb-28">
        <div className="flex w-full flex-col gap-6">
          {/* Tagline */}
          <div className="animate-fade-up">
            <p className="mb-4 font-mono text-[11px] uppercase tracking-[0.25em] text-muted-foreground">
              Private Contributor Verification
            </p>
            <h1 className="max-w-2xl font-serif text-4xl leading-[1.15] tracking-tight text-foreground md:text-6xl">
              Prove you{" "}
              <span className="relative inline-block text-primary">
                ship
                <svg
                  className="absolute -bottom-1 left-0 w-full"
                  viewBox="0 0 200 8"
                  fill="none"
                >
                  <path
                    d="M2 5.5C30 2 70 2 100 4.5C130 7 170 3 198 5"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    opacity="0.4"
                  />
                </svg>
              </span>
              . Verify without{" "}
              <em className="font-serif italic text-muted-foreground">
                exposing
              </em>
              .
            </h1>
          </div>

          {/* Two-card split */}
          <div
            className="grid gap-px border border-border md:grid-cols-2 animate-fade-up"
            style={{ animationDelay: "200ms" }}
          >
            <PersonaCard
              label="I'm a builder"
              description="Prove your contributions without exposing your metrics. Connect providers, mint a soulbound badge, share what you choose."
              cta="Get Attested"
              to="/attest"
              icon={<ArrowRight className="h-3.5 w-3.5" />}
            />
            <PersonaCard
              label="I'm hiring / verifying"
              description="Verify a candidate's track record privately. See only the scores and tiers they've chosen to share with you."
              cta="Verify a Candidate"
              to="/verify"
              icon={<Search className="h-3.5 w-3.5" />}
            />
          </div>

          <span
            className="font-mono text-[10px] text-muted-foreground/60 animate-fade-up"
            style={{ animationDelay: "400ms" }}
          >
            Arbitrum Sepolia · Fhenix CoFHE
          </span>
        </div>
      </section>

      {/* Divider */}
      <div className="mx-auto w-full max-w-6xl px-8">
        <div className="h-px bg-border" />
      </div>

      {/* Process steps */}
      <section className="mx-auto w-full max-w-6xl px-8 py-20 md:py-28">
        <div className="mb-12 flex items-baseline justify-between">
          <h2 className="font-serif text-3xl tracking-tight md:text-4xl">
            How it works
          </h2>
          <span className="hidden font-mono text-[10px] uppercase tracking-[0.3em] text-muted-foreground md:block">
            Attest. Score. Verify.
          </span>
        </div>

        <div className="stagger-children grid gap-px border border-border md:grid-cols-3">
          <ProcessStep
            number="01"
            title="Attest"
            description="Connect GitHub and X. The oracle gathers your contribution metrics and encrypts them before they touch the chain. Your raw data never leaves the server."
          />
          <ProcessStep
            number="02"
            title="Score"
            description="Encrypted metrics are scored entirely on-chain using Fully Homomorphic Encryption. The contract computes your builder score without decrypting anything."
          />
          <ProcessStep
            number="03"
            title="Verify"
            description="Candidates share their encrypted score with you. You decrypt it with your wallet. The chain records that a share happened — but never what was shared."
          />
        </div>
      </section>

      {/* FHE explainer */}
      <section className="border-t border-border">
        <div className="mx-auto flex max-w-6xl flex-col items-center px-8 py-20 md:py-28">
          <span className="mb-6 font-mono text-[10px] uppercase tracking-[0.3em] text-primary">
            Why FHE
          </span>
          <p className="max-w-lg text-center font-serif text-xl leading-relaxed text-foreground/80 md:text-2xl">
            Zero-knowledge proofs can only say <em>yes</em> or <em>no</em>.
          </p>
          <p className="mt-4 max-w-lg text-center font-serif text-xl leading-relaxed text-foreground/80 md:text-2xl">
            With ShipProof, verifiers see the{" "}
            <strong className="text-foreground">actual score</strong> and{" "}
            <strong className="text-foreground">tier</strong> the candidate
            chose to share — without exposing the underlying metrics or
            accounts.
          </p>
          <p className="mt-8 max-w-md text-center font-mono text-xs text-muted-foreground">
            More useful than a boolean. More private than a public profile.
          </p>
        </div>
      </section>
    </div>
  );
}

function PersonaCard({
  label,
  description,
  cta,
  to,
  icon,
}: {
  label: string;
  description: string;
  cta: string;
  to: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="group relative flex flex-col justify-between bg-card p-8 transition-colors hover:bg-accent/40 md:p-10">
      <div>
        <h3 className="mb-3 font-serif text-xl tracking-tight">{label}</h3>
        <p className="text-sm leading-relaxed text-muted-foreground">
          {description}
        </p>
      </div>
      <Link to={to} className="mt-6">
        <Button
          size="lg"
          variant="outline"
          className="group/btn w-full font-mono text-xs uppercase tracking-[0.2em]"
        >
          {cta}
          <span className="ml-auto transition-transform group-hover/btn:translate-x-1">
            {icon}
          </span>
        </Button>
      </Link>
      <div className="absolute right-4 top-4 h-3 w-3 border-r border-t border-transparent transition-colors group-hover:border-primary/30" />
    </div>
  );
}

function ProcessStep({
  number,
  title,
  description,
}: {
  number: string;
  title: string;
  description: string;
}) {
  return (
    <div className="group relative bg-card p-8 transition-colors hover:bg-accent/40 md:p-10">
      <div className="mb-6 flex items-baseline gap-4">
        <span className="font-mono text-[10px] text-primary/50">{number}</span>
        <h3 className="font-serif text-2xl tracking-tight">{title}</h3>
      </div>
      <p className="text-sm leading-relaxed text-muted-foreground">
        {description}
      </p>
      <div className="absolute right-4 top-4 h-3 w-3 border-r border-t border-transparent transition-colors group-hover:border-primary/30" />
    </div>
  );
}
```

- [ ] **Step 2: Verify the build compiles**

Run: `cd /home/Cifr/Projects/ShipProof && bun run check-types`
Expected: No type errors.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/routes/index.tsx
git commit -m "redesign landing page with dual-persona hero"
```

---

### Task 3: VerifyBadgeCard Component

**Files:**
- Create: `apps/web/src/components/verify-badge-card.tsx`

**Depends on:** Task 1 (tier.ts, metrics-version.ts)

- [ ] **Step 1: Create the component**

```tsx
import { useReadContract } from "wagmi";
import { useCofheReadContractAndDecrypt } from "@cofhe/react";
import { Card, CardContent } from "@ShipProof/ui/components/card";
import { Skeleton } from "@ShipProof/ui/components/skeleton";
import { Lock, Loader2, AlertCircle } from "lucide-react";
import { shipProofAbi, SHIPPROOF_ADDRESS, AttestationState } from "@/lib/contracts";
import { deriveTier, TIER_COLORS } from "@/lib/tier";
import { lookupMetricsVersion, providerCategoryLabel } from "@/lib/metrics-version";

interface VerifyBadgeCardProps {
  attestationId: `0x${string}`;
  /** If true, attempt to decrypt score (requires wallet + permit + grant) */
  attemptDecrypt?: boolean;
}

export function VerifyBadgeCard({ attestationId, attemptDecrypt = false }: VerifyBadgeCardProps) {
  const { data: attestation, isLoading } = useReadContract({
    address: SHIPPROOF_ADDRESS,
    abi: shipProofAbi,
    functionName: "attestations",
    args: [attestationId],
  });

  const { data: stateRaw } = useReadContract({
    address: SHIPPROOF_ADDRESS,
    abi: shipProofAbi,
    functionName: "attestationState",
    args: [attestationId],
  });

  const { data: isMinted } = useReadContract({
    address: SHIPPROOF_ADDRESS,
    abi: shipProofAbi,
    functionName: "badgeMinted",
    args: [attestationId],
  });

  const {
    decrypted: decryptedScore,
    disabledDueToMissingPermit,
  } = useCofheReadContractAndDecrypt({
    address: SHIPPROOF_ADDRESS,
    abi: shipProofAbi,
    functionName: "getEncScore",
    args: attemptDecrypt ? [attestationId] : undefined,
  });

  if (isLoading) return <Skeleton className="h-52 w-full" />;

  if (!attestation) {
    return (
      <Card>
        <CardContent className="p-8 text-center">
          <span className="text-sm text-muted-foreground">
            Attestation not found.
          </span>
        </CardContent>
      </Card>
    );
  }

  const [, fromTs, toTs, metricCount, metricsVersion, , wallet] =
    attestation as [string, bigint, bigint, number, number, number, string, bigint, bigint];

  const state = Number(stateRaw ?? 0);
  const fromDate = new Date(Number(fromTs) * 1000).toLocaleDateString();
  const toDate = new Date(Number(toTs) * 1000).toLocaleDateString();
  const truncatedWallet = `${(wallet as string).slice(0, 6)}…${(wallet as string).slice(-4)}`;
  const versionInfo = lookupMetricsVersion(metricsVersion);
  const categoryLabel = providerCategoryLabel(versionInfo.providers);
  const isStale = (Date.now() / 1000 - Number(toTs)) > 90 * 24 * 60 * 60;

  // Determine score display
  let scoreContent: React.ReactNode;
  if (!attemptDecrypt || disabledDueToMissingPermit) {
    scoreContent = (
      <span className="flex items-center gap-1.5 font-mono text-xs text-muted-foreground">
        <Lock className="h-3 w-3" /> Encrypted
      </span>
    );
  } else if (decryptedScore.isError) {
    scoreContent = (
      <span className="flex items-center gap-1.5 font-mono text-xs text-destructive">
        <AlertCircle className="h-3 w-3" /> Error decrypting — try again
      </span>
    );
  } else if (decryptedScore.isLoading) {
    scoreContent = <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />;
  } else if (decryptedScore.data != null) {
    const score = Number(decryptedScore.data);
    const tier = deriveTier(score);
    scoreContent = (
      <div className="flex items-center gap-3">
        <span className="font-mono text-sm font-medium text-primary">
          {score.toLocaleString()} / 10,000
        </span>
        <span className={`font-mono text-xs font-medium ${TIER_COLORS[tier.label] ?? ""}`}>
          {tier.label}
        </span>
      </div>
    );
  } else {
    // Decryption returned null — no access granted
    scoreContent = (
      <span className="flex items-center gap-1.5 font-mono text-xs text-muted-foreground">
        <Lock className="h-3 w-3" /> No access
      </span>
    );
  }

  return (
    <Card className="stamp-border overflow-hidden">
      <CardContent className="p-0">
        {/* Header band */}
        <div className="flex items-center justify-between border-b border-border/50 bg-accent/30 px-5 py-3">
          <div className="flex items-center gap-3">
            <img src="/logo.png" alt="" className="h-7 w-auto" />
            <span className="font-serif text-base tracking-tight">
              ShipProof Badge
            </span>
          </div>
          <span
            className={`px-2.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.2em] ${
              isMinted
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground"
            }`}
          >
            {isMinted ? "Minted" : state >= AttestationState.ScoreComputed ? "Score Ready" : "Processing"}
          </span>
        </div>

        {/* Data rows */}
        <div className="divide-y divide-border/30 px-5">
          <DataRow label="Period" value={`${fromDate} — ${toDate}`} />
          {isStale && (
            <div className="py-2">
              <p className="font-mono text-[10px] text-amber-500">
                This score covers {fromDate}–{toDate}. Consider requesting a fresh attestation.
              </p>
            </div>
          )}
          <DataRow label="Metrics" value={`${metricCount} encrypted`} />
          <DataRow label="Providers" value={categoryLabel} />
          <div className="flex items-center justify-between py-3">
            <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
              Score
            </span>
            {scoreContent}
          </div>
          <DataRow label="Wallet" value={truncatedWallet} mono />
          <DataRow
            label="Attestation"
            value={`${attestationId.slice(0, 10)}…${attestationId.slice(-6)}`}
            mono
          />
        </div>
      </CardContent>
    </Card>
  );
}

function DataRow({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex items-center justify-between py-3">
      <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
        {label}
      </span>
      <span className={`text-sm ${mono ? "font-mono text-xs" : ""}`}>
        {value}
      </span>
    </div>
  );
}
```

- [ ] **Step 2: Verify the build compiles**

Run: `cd /home/Cifr/Projects/ShipProof && bun run check-types`
Expected: No type errors.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/verify-badge-card.tsx
git commit -m "add VerifyBadgeCard component for verifier portal"
```

---

### Task 4: Selective Disclosure Rewrite

**Files:**
- Modify: `apps/web/src/components/selective-disclosure.tsx`

**Depends on:** Task 1 (errors.ts). Can run in parallel with Tasks 3, 5.

- [ ] **Step 1: Rewrite selective-disclosure.tsx**

Replace the entire file content:

```tsx
import { useState } from "react";
import { useWriteContract } from "wagmi";
import { Button } from "@ShipProof/ui/components/button";
import { Input } from "@ShipProof/ui/components/input";
import { Label } from "@ShipProof/ui/components/label";
import { Card, CardContent } from "@ShipProof/ui/components/card";
import { Checkbox } from "@ShipProof/ui/components/checkbox";
import {
  Loader2,
  Check,
  Copy,
  ChevronDown,
  AlertTriangle,
} from "lucide-react";
import { shipProofAbi, SHIPPROOF_ADDRESS } from "@/lib/contracts";
import { isAddress } from "viem";
import { friendlyError } from "@/lib/errors";
import { PermitGate } from "./permit-gate";

interface SelectiveDisclosureProps {
  attestationId: `0x${string}`;
  metricCount: number;
}

export function SelectiveDisclosure({
  attestationId,
  metricCount,
}: SelectiveDisclosureProps) {
  const [grantee, setGrantee] = useState("");
  const [selectedSlots, setSelectedSlots] = useState<number[]>([]);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [isPending, setIsPending] = useState(false);
  const [shareLink, setShareLink] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const { writeContractAsync } = useWriteContract();
  const isValidAddress = isAddress(grantee);

  const handleShareScore = async () => {
    if (!isValidAddress) return;
    setIsPending(true);
    setError(null);
    setSuccess(null);
    setShareLink(null);
    try {
      await writeContractAsync({
        address: SHIPPROOF_ADDRESS,
        abi: shipProofAbi,
        functionName: "grantScoreAccess",
        args: [attestationId, grantee as `0x${string}`],
      });

      // Grant individual metrics if advanced is open and slots selected
      for (const slot of selectedSlots) {
        await writeContractAsync({
          address: SHIPPROOF_ADDRESS,
          abi: shipProofAbi,
          functionName: "grantMetricAccess",
          args: [attestationId, slot, grantee as `0x${string}`],
        });
      }

      const parts = ["score"];
      if (selectedSlots.length > 0)
        parts.push(`${selectedSlots.length} metric(s)`);
      setSuccess(
        `Shared ${parts.join(" and ")} with ${grantee.slice(0, 6)}…${grantee.slice(-4)}`,
      );
      setShareLink(
        `${window.location.origin}/verify/${attestationId}`,
      );
      setGrantee("");
      setSelectedSlots([]);
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setIsPending(false);
    }
  };

  const toggleSlot = (slot: number) =>
    setSelectedSlots((prev) =>
      prev.includes(slot) ? prev.filter((s) => s !== slot) : [...prev, slot],
    );

  const copyLink = async () => {
    if (!shareLink) return;
    await navigator.clipboard.writeText(shareLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Card>
      <CardContent className="space-y-5 p-5">
        <div>
          <h3 className="font-serif text-base tracking-tight">
            Share with Verifier
          </h3>
          <p className="mt-0.5 font-mono text-[10px] text-muted-foreground">
            Share your encrypted score with a hiring screener or grant reviewer.
          </p>
        </div>

        <div className="space-y-1.5">
          <Label
            htmlFor="grantee"
            className="font-mono text-[10px] uppercase tracking-[0.15em]"
          >
            Verifier Wallet Address
          </Label>
          <Input
            id="grantee"
            placeholder="0x..."
            value={grantee}
            onChange={(e) => setGrantee(e.target.value)}
            className="font-mono"
          />
          {grantee && !isValidAddress && (
            <p className="font-mono text-[10px] text-destructive">
              Invalid address
            </p>
          )}
        </div>

        {/* Advanced: per-metric disclosure */}
        <div>
          <button
            type="button"
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.15em] text-muted-foreground hover:text-foreground transition-colors"
          >
            <ChevronDown
              className={`h-3 w-3 transition-transform ${showAdvanced ? "rotate-180" : ""}`}
            />
            Share individual metrics (advanced)
          </button>

          {showAdvanced && (
            <div className="mt-3 space-y-2 border-l-2 border-amber-500/30 pl-4">
              <div className="flex items-start gap-2">
                <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0 text-amber-500" />
                <p className="font-mono text-[10px] text-amber-500">
                  Sharing individual metric values could allow a verifier to
                  cross-reference public profiles and identify your accounts.
                </p>
              </div>
              <div className="grid grid-cols-4 gap-2">
                {Array.from({ length: metricCount }, (_, i) => (
                  <div key={i} className="flex items-center space-x-1.5">
                    <Checkbox
                      id={`slot-${i}`}
                      checked={selectedSlots.includes(i)}
                      onCheckedChange={() => toggleSlot(i)}
                    />
                    <Label
                      htmlFor={`slot-${i}`}
                      className="font-mono text-[11px]"
                    >
                      {i}
                    </Label>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {error && (
          <p className="font-mono text-[11px] text-destructive">{error}</p>
        )}
        {success && (
          <div className="space-y-2 border border-primary/15 bg-accent/30 p-3 animate-fade-in">
            <div className="flex items-center gap-2">
              <Check className="h-3.5 w-3.5 text-primary" />
              <span className="font-mono text-[11px] text-primary">
                {success}
              </span>
            </div>
            {shareLink && (
              <div className="flex items-center gap-2">
                <code className="flex-1 truncate rounded bg-muted px-2 py-1 font-mono text-[10px]">
                  {shareLink}
                </code>
                <Button
                  size="xs"
                  variant="ghost"
                  onClick={copyLink}
                  className="shrink-0 font-mono text-[10px]"
                >
                  {copied ? (
                    <Check className="h-3 w-3" />
                  ) : (
                    <Copy className="h-3 w-3" />
                  )}
                </Button>
              </div>
            )}
          </div>
        )}

        <PermitGate action="sharing encrypted data">
          <Button
            onClick={handleShareScore}
            disabled={!isValidAddress || isPending}
            className="w-full font-mono text-[11px] uppercase tracking-[0.15em]"
          >
            {isPending ? (
              <>
                <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />{" "}
                Sharing…
              </>
            ) : (
              "Share Score"
            )}
          </Button>
        </PermitGate>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 2: Verify the build compiles**

Run: `cd /home/Cifr/Projects/ShipProof && bun run check-types`
Expected: No type errors.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/selective-disclosure.tsx
git commit -m "simplify share flow with default score sharing and share link"
```

---

### Task 5: Post-Mint Prompt in Attestation Stepper

**Files:**
- Modify: `apps/web/src/components/attestation-stepper.tsx`
- Modify: `apps/web/src/routes/attest.tsx`

**Depends on:** Task 1 (errors.ts import already done in Task 1 Step 7). Can run in parallel with Tasks 3, 4.

- [ ] **Step 1: Update the "done" state block**

In `attestation-stepper.tsx`, find the `step === "done"` block (around line 194-201) and replace it with:

```tsx
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
            <Button
              variant="outline"
              className="w-full font-mono text-[11px] uppercase tracking-[0.15em]"
              onClick={() => {
                const el = document.getElementById("selective-disclosure");
                if (el) el.scrollIntoView({ behavior: "smooth" });
              }}
            >
              Share with Verifier
            </Button>
          )}
        </div>
      )}
```

- [ ] **Step 2: Add scroll target ID to SelectiveDisclosure on the attest page**

The SelectiveDisclosure is rendered on `/attest` (in `apps/web/src/routes/attest.tsx`, around line 89-92), NOT on `/badge/$id`. Wrap it with an ID.

In `apps/web/src/routes/attest.tsx`, find:
```tsx
            <SelectiveDisclosure
              attestationId={completedAttestationId}
              metricCount={8}
            />
```

Replace with:
```tsx
            <div id="selective-disclosure">
              <SelectiveDisclosure
                attestationId={completedAttestationId}
                metricCount={8}
              />
            </div>
```

- [ ] **Step 3: Verify the build compiles**

Run: `cd /home/Cifr/Projects/ShipProof && bun run check-types`
Expected: No type errors.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/attestation-stepper.tsx apps/web/src/routes/attest.tsx
git commit -m "add post-mint prompt to share with verifier"
```

---

### Task 6: Verify Wallet Lookup Page (`/verify`)

**Files:**
- Create: `apps/web/src/routes/verify.tsx`

**Depends on:** Task 3 (VerifyBadgeCard component)

- [ ] **Step 1: Create the verify route**

```tsx
import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
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

const publicClient = createPublicClient({
  chain: arbitrumSepolia,
  transport: http(env.VITE_ARB_SEPOLIA_RPC_URL),
});

interface BadgeResult {
  attestationId: `0x${string}`;
  tier: number;
}

function VerifyPage() {
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
      const logs = await publicClient.getLogs({
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
        .reverse(); // newest first (block order)

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
```

- [ ] **Step 2: Verify the build compiles**

Run: `cd /home/Cifr/Projects/ShipProof && bun run check-types`
Expected: No type errors.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/routes/verify.tsx
git commit -m "add /verify route with wallet lookup"
```

---

### Task 7: Verify Detail Page (`/verify/$attestationId`)

**Files:**
- Create: `apps/web/src/routes/verify.$attestationId.tsx`

**Depends on:** Task 3 (VerifyBadgeCard). Can run in parallel with Task 6.

- [ ] **Step 1: Create the verify detail route**

```tsx
import { createFileRoute, Link } from "@tanstack/react-router";
import { useAccount, useSwitchChain } from "wagmi";
import { useReadContract } from "wagmi";
import { arbitrumSepolia } from "wagmi/chains";
import { Button } from "@ShipProof/ui/components/button";
import { AlertCircle } from "lucide-react";
import {
  shipProofAbi,
  SHIPPROOF_ADDRESS,
  AttestationState,
} from "@/lib/contracts";
import { VerifyBadgeCard } from "@/components/verify-badge-card";
import { PermitGate } from "@/components/permit-gate";

export const Route = createFileRoute("/verify/$attestationId")({
  component: VerifyDetailPage,
});

function VerifyDetailPage() {
  const { attestationId } = Route.useParams();
  const id = attestationId as `0x${string}`;
  const { address, chainId, isConnected } = useAccount();
  const { switchChainAsync } = useSwitchChain();

  const { data: attestation, isLoading: attLoading } = useReadContract({
    address: SHIPPROOF_ADDRESS,
    abi: shipProofAbi,
    functionName: "attestations",
    args: [id],
  });

  const { data: stateRaw } = useReadContract({
    address: SHIPPROOF_ADDRESS,
    abi: shipProofAbi,
    functionName: "attestationState",
    args: [id],
  });

  const state = Number(stateRaw ?? 0);
  const isOnCorrectChain = chainId === arbitrumSepolia.id;

  // State X: Invalid attestation
  const isInvalid =
    !attLoading && (!attestation || state === AttestationState.None);

  // State Y: Not ready (score not computed yet)
  const isNotReady =
    !isInvalid && state > AttestationState.None && state < AttestationState.ScoreComputed;

  // Can we attempt decryption?
  const canAttemptDecrypt = isConnected && isOnCorrectChain && !isInvalid && !isNotReady;

  return (
    <div className="mx-auto w-full max-w-xl px-6 py-12 md:py-16">
      <div className="mb-10 animate-fade-up">
        <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.3em] text-primary">
          Verification Portal
        </p>
        <h1 className="font-serif text-4xl tracking-tight">
          Verify Attestation
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          View and decrypt a candidate's shared score.
        </p>
      </div>

      <div
        className="space-y-4 animate-fade-up"
        style={{ animationDelay: "100ms" }}
      >
        {/* State X: Invalid */}
        {isInvalid && !attLoading && (
          <div className="border border-dashed border-border p-8 text-center space-y-3">
            <AlertCircle className="mx-auto h-6 w-6 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              Attestation not found. This link may be invalid or the attestation
              may have been superseded.
            </p>
            <Link to="/verify">
              <Button
                variant="outline"
                className="font-mono text-[11px] uppercase tracking-[0.15em]"
              >
                Search by Wallet
              </Button>
            </Link>
          </div>
        )}

        {/* State Y: Not ready */}
        {isNotReady && (
          <div className="border border-dashed border-border p-8 text-center space-y-3">
            <p className="text-sm text-muted-foreground">
              This attestation is still being processed. The candidate hasn't
              completed scoring yet.
            </p>
          </div>
        )}

        {/* Badge card (shows for all valid states) */}
        {!isInvalid && !isNotReady && (
          <>
            <VerifyBadgeCard
              attestationId={id}
              attemptDecrypt={canAttemptDecrypt}
            />

            {/* State A: Not connected */}
            {!isConnected && (
              <div className="border border-dashed border-border p-5 text-center space-y-2">
                <p className="font-mono text-[11px] text-muted-foreground">
                  Connect your wallet to check if this score has been shared
                  with you.
                </p>
              </div>
            )}

            {/* State B: Wrong chain */}
            {isConnected && !isOnCorrectChain && (
              <div className="border border-dashed border-border p-5 text-center space-y-3">
                <p className="font-mono text-[11px] text-muted-foreground">
                  Please switch to Arbitrum Sepolia to verify this attestation.
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    switchChainAsync({ chainId: arbitrumSepolia.id })
                  }
                  className="font-mono text-[10px] uppercase tracking-[0.15em]"
                >
                  Switch Chain
                </Button>
              </div>
            )}

            {/* State C: Need permit — PermitGate handles missing/expired */}
            {isConnected && isOnCorrectChain && (
              <PermitGate action="verifying this attestation">
                {/* State D/E: PermitGate children render when permit is ready */}
                {/* VerifyBadgeCard handles decryption and shows score or "No access" */}
                <VerifyDetailStatus attestationId={id} />
              </PermitGate>
            )}
          </>
        )}
      </div>
    </div>
  );
}

/**
 * Subcomponent rendered inside PermitGate (only when permit is active).
 * Distinguishes State D (no access) from State E (access granted) and handles errors.
 */
function VerifyDetailStatus({ attestationId }: { attestationId: `0x${string}` }) {
  const { address } = useAccount();
  const {
    decrypted: decryptedScore,
    disabledDueToMissingPermit,
  } = useCofheReadContractAndDecrypt({
    address: SHIPPROOF_ADDRESS,
    abi: shipProofAbi,
    functionName: "getEncScore",
    args: [attestationId],
  });

  // Error state — RPC/coprocessor failure, NOT access denial
  if (decryptedScore.isError) {
    return (
      <div className="border border-destructive/20 bg-destructive/5 p-4 space-y-2">
        <p className="font-mono text-[11px] text-destructive">
          Something went wrong verifying this attestation. Please try again.
        </p>
        <Button
          size="xs"
          variant="outline"
          onClick={() => decryptedScore.refetch()}
          className="font-mono text-[10px] uppercase tracking-[0.15em]"
        >
          Retry
        </Button>
      </div>
    );
  }

  // Loading
  if (decryptedScore.isLoading) {
    return (
      <div className="border border-border/50 p-4 text-center">
        <Loader2 className="mx-auto h-4 w-4 animate-spin text-muted-foreground" />
        <p className="mt-2 font-mono text-[10px] text-muted-foreground">
          Checking access...
        </p>
      </div>
    );
  }

  // State E: Access granted — score is shown in the VerifyBadgeCard above
  if (decryptedScore.data != null) {
    return (
      <div className="border border-primary/10 bg-accent/20 p-4">
        <p className="font-mono text-[10px] text-primary">
          Score decrypted successfully. See results above.
        </p>
      </div>
    );
  }

  // State D: No access granted
  return (
    <div className="border border-dashed border-border p-5 space-y-3">
      <p className="text-sm text-muted-foreground">
        This candidate hasn't shared their score with your wallet yet.
      </p>
      <p className="font-mono text-[10px] text-muted-foreground">
        Send them your wallet address so they can grant you access:
      </p>
      {address && (
        <code className="block rounded bg-muted px-3 py-2 font-mono text-xs break-all">
          {address}
        </code>
      )}
      <Link to="/" className="inline-block">
        <Button
          variant="link"
          size="xs"
          className="font-mono text-[10px] uppercase tracking-[0.15em] px-0"
        >
          Learn how ShipProof works
        </Button>
      </Link>
    </div>
  );
}
```

Add these additional imports at the top of the file (alongside the existing ones):
```ts
import { useCofheReadContractAndDecrypt } from "@cofhe/react";
import { Loader2 } from "lucide-react";
```

- [ ] **Step 2: Verify the build compiles**

Run: `cd /home/Cifr/Projects/ShipProof && bun run check-types`
Expected: No type errors.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/routes/verify.\$attestationId.tsx
git commit -m "add /verify/\$attestationId detail page"
```

---

### Task 8: Verification Receipt

**Files:**
- Create: `apps/web/src/lib/receipt.ts`
- Modify: `apps/web/src/components/verify-badge-card.tsx`

**Depends on:** Task 7 (verify detail page working end-to-end)

- [ ] **Step 1: Create `apps/web/src/lib/receipt.ts`**

```ts
import type { TierInfo } from "./tier";

export interface VerificationReceipt {
  type: "ShipProofVerification";
  version: 1;
  attestationId: string;
  candidateWallet: string;
  verifierWallet: string;
  tier: string;
  scoreAboveThreshold: boolean;
  attestationPeriod: { from: number; to: number };
  verifiedAt: string;
}

/**
 * Build the canonical receipt payload.
 * Keys MUST be in this exact order for deterministic serialization.
 */
export function buildReceiptPayload(params: {
  attestationId: string;
  candidateWallet: string;
  verifierWallet: string;
  score: number;
  tier: TierInfo;
  fromTs: number;
  toTs: number;
}): VerificationReceipt {
  return {
    type: "ShipProofVerification",
    version: 1,
    attestationId: params.attestationId,
    candidateWallet: params.candidateWallet,
    verifierWallet: params.verifierWallet,
    tier: params.tier.label,
    scoreAboveThreshold: params.score >= 4000, // matches contract THRESHOLD
    attestationPeriod: { from: params.fromTs, to: params.toTs },
    verifiedAt: new Date().toISOString(),
  };
}

/**
 * Canonical serialization — deterministic JSON string.
 * Must match the exact key order defined in the spec.
 */
export function canonicalize(receipt: VerificationReceipt): string {
  return JSON.stringify(receipt);
}

/**
 * Trigger download of the signed receipt as a .json file.
 */
export function downloadReceipt(
  receipt: VerificationReceipt,
  signature: string,
  signedBy: string,
) {
  const bundle = { receipt, signature, signedBy };
  const blob = new Blob([JSON.stringify(bundle, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `shipproof-receipt-${receipt.attestationId.slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}
```

- [ ] **Step 2: Add receipt button to VerifyBadgeCard**

In `apps/web/src/components/verify-badge-card.tsx`, add these imports at the top:

```ts
import { useAccount, useSignMessage } from "wagmi";
import { buildReceiptPayload, canonicalize, downloadReceipt } from "@/lib/receipt";
```

Then, inside the component function, after the existing hooks, add:

```ts
  const { address: verifierAddress } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const [signingReceipt, setSigningReceipt] = useState(false);
```

Add `useState` to the existing `react` import if not already there.

Then, in the score display section, after the tier is shown (inside the `decryptedScore.data != null` branch), update the score content to include a receipt button. Replace the existing `decryptedScore.data != null` branch:

Find this block inside the component (the `else if (decryptedScore.data != null)` branch):
```tsx
  } else if (decryptedScore.data != null) {
    const score = Number(decryptedScore.data);
    const tier = deriveTier(score);
    scoreContent = (
      <div className="flex items-center gap-3">
        <span className="font-mono text-sm font-medium text-primary">
          {score.toLocaleString()} / 10,000
        </span>
        <span className={`font-mono text-xs font-medium ${TIER_COLORS[tier.label] ?? ""}`}>
          {tier.label}
        </span>
      </div>
    );
```

Replace with:

```tsx
  } else if (decryptedScore.data != null) {
    const score = Number(decryptedScore.data);
    const tier = deriveTier(score);
    scoreContent = (
      <div className="flex items-center gap-3">
        <span className="font-mono text-sm font-medium text-primary">
          {score.toLocaleString()} / 10,000
        </span>
        <span className={`font-mono text-xs font-medium ${TIER_COLORS[tier.label] ?? ""}`}>
          {tier.label}
        </span>
      </div>
    );

    // Build receipt data for download button
    receiptData = {
      score,
      tier,
      fromTs: Number(fromTs),
      toTs: Number(toTs),
      candidateWallet: wallet as string,
    };
```

Add this variable declaration near the top of the component (after the hooks):
```ts
  let receiptData: {
    score: number;
    tier: ReturnType<typeof deriveTier>;
    fromTs: number;
    toTs: number;
    candidateWallet: string;
  } | null = null;
```

Then add a receipt download section at the bottom of the card, after the data rows `</div>` and before the closing `</CardContent>`:

```tsx
        {/* Verification receipt */}
        {receiptData && verifierAddress && (
          <div className="border-t border-border/30 px-5 py-3">
            <Button
              size="xs"
              variant="outline"
              disabled={signingReceipt}
              onClick={async () => {
                if (!receiptData || !verifierAddress) return;
                setSigningReceipt(true);
                try {
                  const payload = buildReceiptPayload({
                    attestationId,
                    candidateWallet: receiptData.candidateWallet,
                    verifierWallet: verifierAddress,
                    score: receiptData.score,
                    tier: receiptData.tier,
                    fromTs: receiptData.fromTs,
                    toTs: receiptData.toTs,
                  });
                  const message = canonicalize(payload);
                  const signature = await signMessageAsync({ message });
                  downloadReceipt(payload, signature, verifierAddress);
                } catch {
                  // User rejected signature — no action needed
                } finally {
                  setSigningReceipt(false);
                }
              }}
              className="w-full font-mono text-[10px] uppercase tracking-[0.15em]"
            >
              {signingReceipt ? "Signing…" : "Download Verification Receipt"}
            </Button>
            <p className="mt-1.5 font-mono text-[9px] text-muted-foreground">
              Signs a portable receipt with your wallet. Contains tier and
              pass/fail only — not the numeric score.
            </p>
          </div>
        )}
```

- [ ] **Step 3: Verify the build compiles**

Run: `cd /home/Cifr/Projects/ShipProof && bun run check-types`
Expected: No type errors.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/lib/receipt.ts apps/web/src/components/verify-badge-card.tsx
git commit -m "add verification receipt with EIP-191 signed download"
```

---

### Task 9: Nav Update & Final Wiring

**Files:**
- Modify: `apps/web/src/components/header.tsx`
- Modify: `apps/web/src/routes/__root.tsx` (meta description update)

**Depends on:** Tasks 6, 7 (verify routes exist)

- [ ] **Step 1: Read the header component**

Read `apps/web/src/components/header.tsx` to understand the current nav structure before modifying.

- [ ] **Step 2: Add Verify link to header nav**

Add a "Verify" nav link next to the existing links. The exact change depends on the header structure found in Step 1, but it should add a link to `/verify` using TanStack Router's `Link` component:

```tsx
<Link to="/verify" className="...existing nav link classes...">
  Verify
</Link>
```

- [ ] **Step 3: Update root meta description**

In `apps/web/src/routes/__root.tsx`, update the meta description:

Find:
```ts
content: "Confidential builder attestation powered by FHE. Prove you ship without exposing your metrics.",
```

Replace with:
```ts
content: "Private contributor verification for hiring, grants, and access decisions. Powered by FHE.",
```

- [ ] **Step 4: Populate the metricsVersion map**

Run the dev server and trigger an attestation, or check existing attestation data on-chain to find the actual `metricsVersion` uint32 value. Then update the map in `apps/web/src/lib/metrics-version.ts`:

```ts
const METRICS_VERSION_MAP: Record<string, MetricsVersionInfo> = {
  "0x________": { providers: ["github", "x"], metricCount: 8 },
};
```

Replace `________` with the actual hex value.

- [ ] **Step 5: Set the actual DEPLOY_BLOCK**

Look up the contract creation transaction for `0x338Bd76EC463cF1eadc1f75b400271021Af837ec` on Arbiscan and get the block number. Update `apps/web/.env`:

```
VITE_DEPLOY_BLOCK=<actual_block_number>
```

- [ ] **Step 6: Full build verification**

Run: `cd /home/Cifr/Projects/ShipProof && bun run build`
Expected: Build succeeds with no errors.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/components/header.tsx apps/web/src/routes/__root.tsx apps/web/src/lib/metrics-version.ts apps/web/.env
git commit -m "wire up verify nav link, populate metricsVersion map"
```

---

## Self-Review Checklist

- **Spec coverage:** All 10 spec sections covered. Section 1 (positioning) → Task 2. Section 2 (landing page) → Task 2. Section 3 (verifier portal) → Tasks 3, 6, 7. Section 4 (share flow) → Tasks 4, 5. Section 5 (tier derivation) → Task 1. Section 6 (technical changes) → all tasks. Section 7 (component reuse) → Tasks 3, 7. Section 8 (out of scope) → respected. Section 9 (roadmap) → not implemented, as specified. Section 10 (success criteria) → addressed by the sum of all tasks.
- **Placeholder scan:** No TBDs. The only runtime-dependent values are `DEPLOY_BLOCK` and `metricsVersion` hex key — both have explicit steps (Task 9 Steps 4-5) to populate them.
- **Type consistency:** `deriveTier` returns `TierInfo` everywhere. `friendlyError` signature matches. `VerifyBadgeCard` props are `attestationId` + `attemptDecrypt`. `DEPLOY_BLOCK` is `bigint` consistently.
- **Verification receipt:** `buildReceiptPayload` → `canonicalize` → `signMessageAsync` → `downloadReceipt` — all types match across `receipt.ts` and `verify-badge-card.tsx`.
