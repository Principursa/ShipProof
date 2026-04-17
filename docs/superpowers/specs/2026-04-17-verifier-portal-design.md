# Verifier Portal & Narrative Reframe — Design Spec

**Date:** 2026-04-17
**Status:** Draft (v2 — post-Codex review)
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
- Copy: "Verify a candidate's track record privately. See only the scores and tiers they've chosen to share with you."
- CTA: "Verify a Candidate" → `/verify`

Below the fold: existing 3-step explainer (Attest → Score → Prove) reworded to reference both sides. The "Prove" step becomes "Verify" with copy: "Candidates share their encrypted score with you. You decrypt it with your wallet. The chain records that a share happened — but never what was shared."

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
- List of badge cards showing public metadata for each attestation, sorted by `toTs` descending (newest first)
- Most recent badge highlighted as "Latest"
- Each card links to `/verify/{attestationId}`
- Empty state: "No ShipProof badges found for this address"

**Multiple attestations:** A wallet can have multiple badges (e.g., different time windows, different provider sets). The lookup shows all of them. The most recent by attestation period (`toTs`) is marked "Latest" and shown first. Historical badges are shown below with their period for context. The screener picks which one to verify.

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

Note: The `tier` field in the event is a placeholder value (1) — actual tier is derived client-side from the decrypted score.

`DEPLOY_BLOCK` is sourced from env var `VITE_DEPLOY_BLOCK` (not hardcoded) to survive redeployments.

### 3.3 — `/verify/$attestationId` — Verification Detail

This page works for **any attestation ID** — it reads attestation data directly from `attestations(attestationId)` on the contract, not from badge events. This means share links work even if the badge hasn't been minted yet (score sharing is possible from state `ScoreComputed` onward).

**Five states:**

#### State A: No wallet connected (teaser)
- Badge card showing public metadata:
  - Attestation status: "Badge Minted" or "Score Computed" (read from `attestationState`)
  - Attestation period (fromTs – toTs, read from `attestations(attestationId)`)
  - Provider categories (derived from metricsVersion — see Section 3.5)
  - Metric count (read from attestation metadata)
- Locked score display with visual treatment (shimmer/pulse):
  - "Score shared with you — connect wallet to reveal"
- CTA: "Connect Wallet"

#### State B: Wallet connected, wrong chain
- Same public metadata as State A
- "Please switch to Arbitrum Sepolia to verify this attestation"
- Chain switch button via `useSwitchChain`

#### State C: Wallet connected, no permit
- Same public metadata as State A
- `PermitGate` component handles permit creation
- States: missing permit → "Create Permit" button; expired permit → "Renew Permit" button

#### State D: Wallet connected + permit, no access granted
- Same public metadata
- Friendly message (not an error):
  - "This candidate hasn't shared their score with your wallet yet."
  - "Send them your wallet address so they can grant you access:"
  - Copyable display of the screener's connected wallet address
  - Link: "Learn how ShipProof works" → `/`

#### State E: Wallet connected + permit, access granted
- Public metadata
- Decrypted score displayed prominently (e.g., "7,200 / 10,000")
- Tier badge derived client-side: Bronze / Silver / Gold / Diamond
- Provider categories (not specific values): "Includes code activity and social metrics"
- Attestation date and wallet address for reference
- **Verification receipt** (see Section 3.6)
- If attestation period is older than 90 days: subtle "Stale attestation" note — "This score covers {fromTs}–{toTs}. Consider requesting a fresh attestation."

**Access detection:**
- Connect wallet → ensure correct chain → create CoFHE permit via `PermitGate`
- Read `getEncScore(attestationId)` → attempt decryption via `useCofheReadContractAndDecrypt`
- If decryption succeeds → State E
- If decryption fails (no FHE.allow grant) → State D

**Edge case — metric access without score access:**
- If a screener has been granted per-metric access but not score access, show State D (no score) with a note: "You have access to individual metrics but not the overall score. Ask the candidate to share their score for a complete picture."

### 3.4 — Privacy Model for Verifiers

**Public metadata (visible to anyone, on-chain):**
- Attestation exists (attestation ID, state)
- Attestation period (fromTs, toTs)
- Metric count and metricsVersion hash
- Badge minted status
- `ScoreAccessGranted` / `MetricAccessGranted` events (grantee address is public)
- The fact that a share happened is visible; the content of what was shared is not

**What the screener can see (requires FHE grant + permit):**
- Score (aggregate, weighted composite) — if granted via `grantScoreAccess`
- Tier (derived client-side from score) — if score granted
- Individual metric values (if granted via `grantMetricAccess`) — advanced, attester-initiated only

**What the screener CANNOT see:**
- Individual metric values (unless explicitly granted by attester)
- Provider account identities (GitHub username, X handle)
- Other candidates' data
- The scoring formula weights or caps (on-chain but not surfaced in UI)

**Honest privacy boundary:** The grant events are public. An observer can see *that* wallet A shared something with wallet B, and *when*. They cannot see *what* was shared (score value, tier, metrics). This is a meaningful privacy property for the hiring use case — the employer-candidate relationship is visible, but the evaluation content is not.

### 3.5 — Provider Category Mapping

`metricsVersion` is a 4-byte hash of sorted metric keys. To show human-readable provider categories on the verifier page, we maintain a static lookup map in the frontend:

```ts
const METRICS_VERSION_MAP: Record<string, { providers: string[]; metricCount: number }> = {
  '0xABCD1234': { providers: ['github', 'x'], metricCount: 8 },
  // Add new entries when provider set changes
}
```

**Fallback:** If `metricsVersion` is not in the map, show generic "Multiple providers" with the raw metric count. This avoids breaking on unknown versions.

**Trade-off:** This is a hardcoded registry. It breaks silently if new providers are added without updating the map. Acceptable for the buildathon — a server-side schema endpoint is the proper solution but out of scope (see Section 8).

### 3.6 — Verification Receipt

After the screener decrypts a score (State E), offer a **client-side signed verification receipt**:

**"Download Verification Receipt" button** generates a JSON object:
```json
{
  "type": "ShipProofVerification",
  "version": 1,
  "attestationId": "0x...",
  "candidateWallet": "0x...",
  "verifierWallet": "0x...",
  "tier": "Gold",
  "scoreAboveThreshold": true,
  "attestationPeriod": { "from": 1704067200, "to": 1711929600 },
  "verifiedAt": "2026-04-17T12:00:00Z"
}
```

The receipt is signed by the screener's wallet (EIP-191 personal sign) so it's attributable but not forgeable. It does NOT include the raw score — only the tier and a boolean "above threshold."

**Why this matters:** It turns a browser-session verification into a portable artifact. The screener can attach it to a hiring decision, save it to a DAO proposal, or reference it later. No contract change needed — purely client-side.

**Privacy note:** The receipt intentionally omits the numeric score. Tier + boolean is sufficient for hiring decisions and prevents score values from leaking into external systems.

---

## 4. Share Flow Improvements

### 4.1 — Selective Disclosure (attester's badge page)

**Simplified default flow:**
1. "Share score with verifier" — single address input + one button
2. Executes `grantScoreAccess(attestationId, granteeAddress)`
3. On success: display copyable share link `shipproof.lol/verify/{attestationId}`

**Flow clarification:** The share link is a convenience locator. Access is wallet-specific — the builder must grant access to the screener's specific wallet address first. The link just directs the screener to the right page. The sequence is: builder enters screener's wallet → grants access (on-chain tx) → copies share link → sends link to screener out-of-band.

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
| `apps/web/src/lib/errors.ts` | Extracted `friendlyError()` shared utility |
| `apps/web/src/lib/metrics-version.ts` | `METRICS_VERSION_MAP` and lookup helper |

### Modified files:
| File | Change |
|---|---|
| `apps/web/src/routes/index.tsx` | Dual-persona hero, updated copy |
| `apps/web/src/routes/__root.tsx` | Add `/verify` to nav |
| `apps/web/src/components/selective-disclosure.tsx` | Simplified default share, copy link, advanced toggle with privacy warning |
| `apps/web/src/components/attestation-stepper.tsx` | Post-mint prompt to share; import `friendlyError` from shared util |
| `apps/web/src/lib/contracts.ts` | Add `DEPLOY_BLOCK` from env var, verify ABI exports |
| `apps/web/.env` | Add `VITE_DEPLOY_BLOCK` |

### No changes:
- No smart contract modifications
- No redeployment
- No new server endpoints
- No indexer or subgraph

---

## 7. Component Reuse

| Existing Component | Reused In |
|---|---|
| `PermitGate` | Verify detail page (decrypt flow, handles missing/expired/disconnected) |
| `BadgeDisplay` | Reference for `VerifyBadgeCard` (not directly reused — verifier view is simpler) |
| `friendlyError()` | Extracted to shared util, used by all pages |
| `useCofheReadContractAndDecrypt` | Verify detail page (score decryption) |
| wagmi `useAccount`, `useConnect`, `useSwitchChain` | Verify pages (wallet connection + chain switching) |

---

## 8. Out of Scope

- No contract changes or redeployment
- No indexer or subgraph
- No Farcaster provider (separate effort if time permits)
- No embeddable widget (see Roadmap, Section 9)
- No per-metric labels in verifier view (privacy risk)
- No Stage 5 hardening (separate effort)
- No server-side schema endpoint for metricsVersion (hardcoded frontend map is sufficient for buildathon)

---

## 9. Roadmap

### 9.1 — Embeddable Verification Widget

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

### 9.2 — Server-Side Schema Registry

Replace the hardcoded `METRICS_VERSION_MAP` with a server endpoint:
`GET /api/schema/:metricsVersion` → `{ slots: [{ index, label, provider }] }`

Enables dynamic provider addition without frontend deploys.

---

## 10. Success Criteria

1. A screener can open a share link, connect their wallet, and see a decrypted score + tier in under 30 seconds (assumes grant already happened)
2. A screener can search by wallet address and find badges without any backend infrastructure
3. The landing page clearly communicates both sides of the market within 5 seconds of loading
4. The default share flow (score only) protects against deanonymization — no individual metric values or provider-specific labels exposed
5. The full attest → share → verify demo can be completed in under 7 minutes
6. Post-mint UX naturally guides the builder toward sharing with a verifier
7. Verification receipt provides a portable, signed artifact the screener can take away
8. Multiple attestations per wallet are handled with clear "Latest" designation and chronological ordering
9. Privacy model is honestly documented — public metadata surface is explicit, not hand-waved
