# ShipProof — Confidential Builder Attestations on FHE

ShipProof is a privacy-first builder attestation system powered by Fully Homomorphic Encryption (FHE). Builders privately prove their contribution history across platforms (GitHub, X, and more), receive an encrypted on-chain score, and mint a soulbound badge — all without exposing raw metrics publicly. Grants committees and verifiers can request access to specific scores or individual metrics through user-controlled selective disclosure.

**Why FHE over ZK?** Zero-knowledge proofs let you prove a statement is true without revealing the data. FHE goes further — it lets the contract *compute* on encrypted data. A grants committee doesn't just learn "this builder passed." They can see the actual score, the tier, or even individual metrics, but only if the builder chooses to share. Selective disclosure at the data level, not the proof level.

## Architecture

```
Builder (Browser)
      ↓ connect wallet + OAuth providers
Oracle Service (Hono)
      ↓ fetch metrics → encrypt (CoFHE) → sign (EIP-712)
Builder (Browser)
      ↓ submit signed envelope on-chain
ShipProof.sol (Arbitrum Sepolia)
      ↓ store encrypted metrics → compute score (FHE) → evaluate pass/fail
      ↓ request decryption → mint soulbound badge
ShipProofBadge.sol (ERC-721)
      ↓ non-transferable NFT tied to attestation
Selective Disclosure
      → builder grants per-address access to score or individual metrics
```

## How It Works

1. **Connect** — wallet (MetaMask) + identity providers (GitHub, X)
2. **Link** — sign a message binding your wallet to your provider identities
3. **Attest** — oracle fetches your metrics, encrypts them with CoFHE, signs the envelope
4. **Submit** — encrypted metrics go on-chain in a single transaction
5. **Score** — contract computes a weighted score entirely on encrypted data
6. **Mint** — if the encrypted score passes the threshold, mint a soulbound badge
7. **Disclose** — selectively grant access to your score or individual metrics per address

The contract never sees plaintext metrics. The oracle can't revoke or modify attestations post-submission. The builder controls who sees what.

## Project Structure

```
ShipProof/
├── apps/
│   ├── server/              # Oracle service (Hono)
│   │   ├── src/
│   │   │   ├── routes/      # auth (OAuth), attest (envelope), wallet (linking)
│   │   │   ├── providers/   # GitHub, X — pluggable MetricProvider interface
│   │   │   ├── attestation/ # pipeline, encrypt (CoFHE), sign (EIP-712)
│   │   │   ├── auth/        # wallet linking + signature verification
│   │   │   └── session.ts   # signed cookie sessions
│   │   └── test/            # 62 tests
│   │
│   └── web/                 # Frontend (React + Vite)
│       └── src/
│           ├── routes/      # /attest (main flow), /badge/$id (badge view)
│           ├── components/  # ConnectWallet, ProviderConnector, WalletLinker,
│           │                # AttestationStepper, BadgeDisplay, SelectiveDisclosure
│           └── lib/         # wagmi config, contract ABI, API client
│
├── contracts/               # Solidity (Foundry)
│   ├── src/
│   │   ├── ShipProof.sol    # Core FHE attestation + scoring + disclosure
│   │   └── ShipProofBadge.sol  # Soulbound ERC-721
│   ├── test/                # 42 tests (CoFHE mock environment)
│   ├── script/              # Deployment scripts
│   └── foundry.toml
│
├── packages/
│   ├── env/                 # Zod-validated environment schemas (server + web)
│   ├── ui/                  # Shared shadcn/ui components
│   └── config/              # Shared TypeScript + Tailwind config
│
├── lib/                     # Git submodules
│   ├── cofhe-contracts/     # Fhenix FHE Solidity library
│   ├── cofhe-mock-contracts/  # FHE mocks for local testing
│   └── openzeppelin-contracts/  # OpenZeppelin v5.6.1
│
└── DEVELOPMENT_SPEC.md      # Full staged specification
```

## Smart Contracts

**Deployed and verified on Arbitrum Sepolia:**
- [ShipProof](https://sepolia.arbiscan.io/address/0xB0744f440ce7a795F3E32932c98B96850Ec21758) — `0xB0744f440ce7a795F3E32932c98B96850Ec21758`
- [ShipProofBadge](https://sepolia.arbiscan.io/address/0x718dcE3D9c2ec77D728Be9dcF741F1Aee2D19abB) — `0x718dcE3D9c2ec77D728Be9dcF741F1Aee2D19abB`

### ShipProof.sol

Core attestation contract. Stores encrypted metrics, computes scores on ciphertext, and gates badge minting on encrypted pass/fail evaluation.

| Function | Description |
|----------|-------------|
| `submitAttestation(meta, configs, encInputs, oracleSig)` | Submit encrypted metrics with oracle signature. Validates configs, stores encrypted values, emits `Attested` event |
| `computeScore(attestationId)` | Normalize and weight each metric on encrypted data: `min(raw, cap) * SCALE / cap * weight`. Accumulates weighted sum |
| `computePass(attestationId)` | Compare encrypted score against threshold using `FHE.gte` |
| `requestPassDecryption(attestationId)` | Request CoFHE decryption of the pass/fail result |
| `mintBadge(attestationId)` | Mint soulbound NFT if decrypted result is "pass". Computes tier (Bronze/Silver/Gold/Diamond) |
| `grantScoreAccess(attestationId, grantee)` | Allow an address to decrypt the encrypted score |
| `grantMetricAccess(attestationId, slotIndex, grantee)` | Allow an address to decrypt a specific encrypted metric |

**Attestation lifecycle:** None → Submitted → ScoreComputed → PassComputed → DecryptRequested → BadgeMinted

**Source-agnostic design:** Metrics are stored as a flat array of up to 16 encrypted uint32 slots. The contract doesn't know what "GitHub commits" or "X followers" means — it just computes on encrypted values with configurable caps and weights. New providers can be added without contract changes.

### ShipProofBadge.sol

Soulbound ERC-721. Can only be minted by the ShipProof contract. Transfers are blocked (reverts if `from != address(0) && to != address(0)`). Each token maps to an attestation ID.

## Providers

Providers implement the `MetricProvider` interface and are registered at server startup. Adding a new provider requires no contract changes.

### GitHub (5 metrics)

| Metric | Cap | Weight | Source |
|--------|-----|--------|--------|
| Commits | 500 | 2000 | GraphQL contributionsCollection |
| Pull Requests | 200 | 2500 | GraphQL contributionsCollection |
| Issues Opened | 100 | 500 | GraphQL contributionsCollection |
| Repo Breadth | 30 | 1000 | Unique repos contributed to |
| PR Reviews | 100 | 1000 | GraphQL contributionsCollection |

### X (3 metrics)

| Metric | Cap | Weight | Source |
|--------|-----|--------|--------|
| Followers | configurable | configurable | Users API v2 |
| Ship Posts | configurable | configurable | Tweets matching shipping patterns |
| Engagement | configurable | configurable | Likes + retweets on ship posts |

Ship posts are detected by regex: terms like "shipped", "launching", "released", "open sourced", or content containing GitHub URLs and commit SHAs.

## Quick Start

### Prerequisites

- [Bun](https://bun.sh/) 1.3+
- [Foundry](https://getfoundry.sh/) (forge, cast)

### Install

```bash
git clone https://github.com/Principursa/ShipProof.git
cd ShipProof
bun install
git submodule update --init --recursive
```

### Contracts

```bash
cd contracts
cp .env.example .env
# Fill in PRIVATE_KEY, ORACLE_ADDRESS, ARB_SEPOLIA_RPC_URL, ARBISCAN_API_KEY

# Test
forge test

# Deploy + verify
source .env
forge script script/DeployShipProof.s.sol \
  --rpc-url $ARB_SEPOLIA_RPC_URL \
  --broadcast \
  --verify
```

### Server

```bash
cd apps/server
# Configure .env:
#   CORS_ORIGIN=http://localhost:5173
#   BASE_URL=http://localhost:3000
#   SESSION_SECRET=<32+ random chars>
#   ORACLE_PRIVATE_KEY=<0x-prefixed private key>
#   ARB_SEPOLIA_RPC_URL=<RPC URL>
#   IDENTITY_SALT=<16+ random chars>
#   SHIPPROOF_CONTRACT_ADDRESS=<deployed address>
#   GITHUB_CLIENT_ID=<GitHub OAuth App>
#   GITHUB_CLIENT_SECRET=<GitHub OAuth App>

bun run dev
```

### Frontend

```bash
cd apps/web
# Configure .env:
#   VITE_SERVER_URL=http://localhost:3000
#   VITE_SHIPPROOF_CONTRACT_ADDRESS=<deployed address>
#   VITE_ARB_SEPOLIA_RPC_URL=<RPC URL>

bun run dev
```

Open `http://localhost:5173/attest` to start the attestation flow.

### GitHub OAuth Setup

Go to **GitHub Settings > Developer Settings > OAuth Apps > New OAuth Application**:
- **Application name:** ShipProof
- **Homepage URL:** `http://localhost:5173`
- **Authorization callback URL:** `http://localhost:3000/auth/github/callback`

Copy the Client ID and Client Secret into `apps/server/.env`.

## Testing

```bash
# Smart contracts (42 tests — attestation, scoring, badges, edge cases, gas profiling)
cd contracts && forge test

# Server (62 tests — providers, auth, attestation pipeline, wallet linking, session)
bun test apps/server/

# Type check everything
bun run check-types
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Contracts | Solidity 0.8.31, Foundry, CoFHE, OpenZeppelin v5.6.1 |
| Server | Hono, cofhejs, viem, Zod |
| Frontend | React 19, Vite, TanStack Router, TanStack Query, wagmi, @cofhe/react, shadcn/ui, Tailwind CSS v4 |
| Chain | Arbitrum Sepolia (421614) |
| Monorepo | Bun workspaces, Turborepo |

## Selective Disclosure Flow

```
Builder mints badge
      ↓
Grants committee requests verification
      ↓
Builder calls grantScoreAccess(attestationId, committeeAddress)
      → committee can now decrypt the encrypted score
      ↓
Builder calls grantMetricAccess(attestationId, slotIndex, committeeAddress)
      → committee can decrypt individual metrics (e.g., only GitHub, not X)
      ↓
Committee verifies on-chain — no off-chain trust required
```

This is what FHE enables that ZK can't: the committee sees the actual numeric score, not just a boolean proof. And the builder chose exactly which data to share, at the individual metric level.

## Attestation Flow (5 transactions)

| Tx | Contract Call | What Happens |
|----|--------------|--------------|
| 1 | `submitAttestation` | Encrypted metrics + oracle signature stored on-chain |
| 2 | `computeScore` | Weighted scoring on encrypted data (FHE.mul, FHE.div, FHE.add) |
| 3 | `computePass` | Encrypted score compared to threshold (FHE.gte) |
| 4 | `requestPassDecryption` | CoFHE decrypts the pass/fail boolean |
| 5 | `mintBadge` | If passed: mint soulbound NFT, compute tier (Bronze/Silver/Gold/Diamond) |

## Security Model

- **No plaintext on-chain** — metrics are encrypted before submission, scoring happens on ciphertext
- **Oracle can't revoke** — once submitted, the attestation is immutable on-chain
- **Anti-sybil** — identity hash derived from provider userIds + salt prevents duplicate attestations
- **Replay protection** — oracle nonce prevents reuse of signed envelopes
- **Expiration** — attestation envelopes expire, preventing stale submissions
- **Soulbound badges** — non-transferable, preventing badge markets
- **Constant-time scoring** — no branching on encrypted values (all via `FHE.select`)
- **Overflow safety** — caps and weights validated to prevent uint32 wraparound in FHE operations

## License

MIT
