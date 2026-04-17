# Verifier Portal & Narrative Reframe — Design Spec

**Date:** 2026-04-17
**Status:** Draft
**Wave:** 3 (deadline 2026-05-08)
**Goal:** Boost Market Potential (5→7+), Innovation (6→7+), and UX (6→7+) scores by making the buyer, use case, and decision flow immediately legible.

---

## 1. Positioning

**Old:** "Prove you ship. Keep your metrics private."
**New:** "Private contributor verification for hiring, grants, and access decisions."

**Primary buyer persona:** Hiring screener — "Has this candidate actually shipped?"
**Primary user persona:** Builder — "Prove my contributions without exposing my accounts."

The product serves both sides of a verification market. The builder creates encrypted attestations; the screener verifies them privately. FHE enables the screener to see the actual score (not just a boolean proof) without the underlying metrics ever being public.

---

## 2. Landing Page — Dual-Persona Hero

Replace the current single-hero layout with two side-by-side cards:

**Left card — "I'm a builder"**
- Copy: "Prove your contributions without exposing your metrics. Connect providers, mint a soulbound badge, share what you choose."
- CTA: "Get Attested" → `/attest`

**Right card — "I'm hiring / verifying"**
- Copy: "Verify a candidate's track record privately. See scores and tiers they've shared with you — nothing more."
- CTA: "Verify a Candidate" → `/verify`

Below the fold: existing 3-step explainer (Attest → Score → Prove) reworded to reference both sides. The "Prove" step becomes "Verify" with copy: "Candidates share their encrypted score with you. You decrypt it with your wallet. The chain sees nothing."

FHE value prop section stays but reframed: "Zero-knowledge proofs can only say yes or no. With ShipProof, verifiers see the actual score and tier the candidate chose to share — without exposing the underlying metrics or accounts."

---

## 3. Verifier Portal

### 3.1 — Routes

| Route | Purpose |
|---|---|
| `/verify` | Wallet lookup — screener searches for a candidate by wallet address |
| `/verify/$attestationId` | Direct share link — also serves as detail view from lookup results |

### 3.2 — `/verify` — Wallet Lookup

**UI:**
- Search bar: "Enter a wallet address to check for ShipProof badges"
- On submit: query `BadgeMinted` events via `viem` `getLogs` filtered by wallet address, scanning from the contract deployment block to latest
- No indexer or subgraph required — direct RPC log query is sufficient for testnet volume

**Results:**
- List of badge cards showing public metadata for each attestation
- Each card links to `/verify/{attestationId}`
- Empty state: "No ShipProof badges found for this address"

**Implementation:**
```ts
const logs = await publicClient.getLogs({
  address: SHIPPROOF_ADDRESS,
  event: parseAbiItem('event BadgeMinted(bytes32 indexed attestationId, address indexed to, uint8 tier)'),
  args: { to: targetAddress },
  fromBlock: DEPLOY_BLOCK,
  toBlock: 'latest'
})
```

Note: The `tier` field in the event is a placeholder value (1) — actual tier is computed via `computeTier()` and derived client-side from the decrypted score.

`DEPLOY_BLOCK` is hardcoded as a constant in `contracts.ts` (the block number of the ShipProof contract deployment).

### 3.3 — `/verify/$attestationId` — Verification Detail

**Three states:**

#### State A: No wallet connected (teaser)
- Badge card showing public metadata:
  - Badge status: "Minted"
  - Attestation period (fromTs – toTs, read from `attestations(attestationId)`)
  - Provider icons (derived from metricsVersion → known provider set)
  - Metric count: "8 metrics across 2 providers"
- Locked score display with visual treatment (shimmer/pulse):
  - "Score shared with you — connect wallet to reveal"
- CTA: "Connect Wallet"

#### State B: Wallet connected, no access granted
- Same public metadata as State A
- Friendly message (not an error):
  - "This candidate hasn't shared their score with your wallet yet."
  - "Send them your wallet address so they can grant you access:"
  - Copyable display of the screener's connected wallet address
  - Link: "Learn how ShipProof works" → `/`

#### State C: Wallet connected, access granted
- Public metadata
- Decrypted score displayed prominently (e.g., "7,200 / 10,000")
- Tier badge derived client-side: Bronze / Silver / Gold / Diamond
- Provider categories (not specific values): "Includes code activity and social metrics"
- Attestation date and wallet address for reference

**Access detection:**
- Connect wallet → create CoFHE permit via `PermitGate`
- Read `getEncScore(attestationId)` → attempt decryption via `useCofheReadContractAndDecrypt`
- If decryption succeeds → State C
- If decryption fails (no FHE.allow grant) → State B

### 3.4 — Privacy Model for Verifiers

**What the screener can see:**
- Score (aggregate, weighted composite) — if granted
- Tier (derived client-side from score) — if score granted
- Provider categories ("code activity", "social metrics") — always visible (public metadata)
- Attestation period and metric count — always visible (public metadata)

**What the screener CANNOT see:**
- Individual metric values (commits, PRs, followers, etc.)
- Provider account identities (GitHub username, X handle)
- Other candidates' data

**Per-metric disclosure (advanced, attester-initiated):**
- The existing `grantMetricAccess` contract function remains available
- Gated behind a privacy warning on the attester's badge page: "Sharing individual metrics may make your accounts identifiable"
- Not surfaced in the verifier portal default view
- If a screener has been granted per-metric access, individual values appear in an expandable "Detailed Metrics" section without provider-specific labels (shown as "Metric 1", "Metric 2", etc.)

---

## 4. Share Flow Improvements

### 4.1 — Selective Disclosure (attester's badge page)

**Simplified default flow:**
1. "Share score with verifier" — single address input + one button
2. Executes `grantScoreAccess(attestationId, granteeAddress)`
3. On success: display copyable share link `shipproof.lol/verify/{attestationId}`

**Advanced toggle (collapsed by default):**
- "Share individual metrics (may reduce anonymity)"
- Expandable section with per-metric checkboxes (existing UI)
- Warning text: "Sharing individual metric values could allow a verifier to cross-reference public profiles and identify your accounts."

### 4.2 — Post-Mint Prompt

After the attestation stepper completes (badge minted), instead of a dead-end success screen:
- "Badge minted! Share it with a verifier."
- Button scrolls to / reveals the selective disclosure section
- Keeps the user in the flow toward the two-sided interaction

---

## 5. Tier Derivation (Client-Side)

Tier is derived from the decrypted score in the frontend. Thresholds match the contract's `computeTier` logic:

```ts
function deriveTier(score: number): { label: string; level: number } {
  if (score >= 7500) return { label: 'Diamond', level: 3 }
  if (score >= 5000) return { label: 'Gold', level: 2 }
  if (score >= 2500) return { label: 'Silver', level: 1 }
  return { label: 'Bronze', level: 0 }
}
```

These thresholds are documented here as the single source of truth. If the contract thresholds change, this function must be updated to match.

---

## 6. Technical Changes

### New files:
| File | Purpose |
|---|---|
| `apps/web/src/routes/verify.tsx` | Wallet lookup page |
| `apps/web/src/routes/verify.$attestationId.tsx` | Verification detail page |
| `apps/web/src/components/verify-badge-card.tsx` | Badge card for verifier view (public metadata + locked/unlocked score + tier) |
| `apps/web/src/lib/tier.ts` | `deriveTier()` utility |

### Modified files:
| File | Change |
|---|---|
| `apps/web/src/routes/index.tsx` | Dual-persona hero, updated copy |
| `apps/web/src/routes/__root.tsx` | Add `/verify` to nav if needed |
| `apps/web/src/components/selective-disclosure.tsx` | Simplified default share, copy link, advanced toggle with privacy warning |
| `apps/web/src/components/attestation-stepper.tsx` | Post-mint prompt to share |
| `apps/web/src/lib/contracts.ts` | Add `DEPLOY_BLOCK` constant, verify `getEncTier` in ABI |

### No changes:
- No smart contract modifications
- No redeployment
- No new server endpoints
- No indexer or subgraph

---

## 7. Component Reuse

| Existing Component | Reused In |
|---|---|
| `PermitGate` | Verify detail page (decrypt flow) |
| `BadgeDisplay` | Reference for `VerifyBadgeCard` (not directly reused — verifier view is simpler) |
| `friendlyError()` | All new pages |
| `useCofheReadContractAndDecrypt` | Verify detail page (score decryption) |
| wagmi `useAccount`, `useConnect` | Verify pages (wallet connection) |

---

## 8. Out of Scope

- No contract changes or redeployment
- No indexer or subgraph
- No Farcaster provider (separate effort if time permits)
- No embeddable widget (see Roadmap)
- No per-metric labels in verifier view (privacy risk)
- No Stage 5 hardening (separate effort)

---

## 9. Roadmap: Embeddable Verification Widget

**Not built this wave, but documented for future / submission narrative.**

An embeddable `<script>` tag + iframe that hiring platforms, grant applications, or bounty boards can add to verify candidates inline:

```html
<script src="https://shipproof.lol/embed.js"></script>
<div id="shipproof-verify" data-attestation="0xABC..."></div>
```

- Wallet connection and FHE decryption sandboxed inside iframe
- Parent page receives `shipproof:verified` event with `{ passed: boolean, tier: string }`
- No raw scores cross the iframe boundary unless explicitly configured
- Turns ShipProof from an app into a distribution primitive

This is the natural evolution of the verifier portal — from "visit our site to verify" to "verify anywhere."

---

## 10. Success Criteria

1. A screener can open a share link, connect their wallet, and see a decrypted score + tier in under 30 seconds
2. A screener can search by wallet address and find badges without any backend infrastructure
3. The landing page clearly communicates both sides of the market within 5 seconds of loading
4. The default share flow (score only) protects against deanonymization — no individual metric values or provider-specific labels exposed
5. The full attest → share → verify demo can be completed in under 7 minutes
6. Post-mint UX naturally guides the builder toward sharing with a verifier
