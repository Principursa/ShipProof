# ShipProof

Private contributor verification. Builders prove their track record without exposing their accounts. Verifiers decrypt only what was shared with them.

Live at [shipproof.lol](https://shipproof.lol) on Arbitrum Sepolia.

## Why FHE

ZK proofs let you prove a statement is true without revealing the data — but they only return a boolean. FHE lets the contract compute on encrypted data. A grants committee doesn't just learn "this builder passed." They see the actual score and tier the builder chose to share, without the underlying metrics or provider accounts ever being exposed.

## Architecture

```
Builder (Browser)
      ↓ connect wallet + OAuth providers
Oracle Service (Bun + Hono)
      ↓ fetch metrics → encrypt server-side (@cofhe/sdk/node) → sign (EIP-712)
Builder (Browser)
      ↓ submit signed envelope on-chain (5 auto-chained txs)
ShipProof.sol (Arbitrum Sepolia)
      ↓ store encrypted metrics → compute score (FHE) → pass/fail → mint badge
ShipProofBadge.sol (ERC-721, soulbound)
      ↓ non-transferable, tied to attestation
Selective Disclosure
      → builder grants per-address access to score or individual metrics
Verifier Portal (/verify)
      → verifier looks up wallet → decrypts shared score → sees tier
```

## How It Works

1. **Connect** — wallet (MetaMask) + identity providers (GitHub, X)
2. **Link** — EIP-191 signature binding wallet to provider identities
3. **Attest** — oracle fetches metrics, encrypts with CoFHE, signs envelope
4. **Score** — contract computes weighted score entirely on encrypted data
5. **Mint** — if encrypted score passes threshold, mint soulbound badge
6. **Disclose** — grant score/metric access to a specific verifier wallet
7. **Verify** — verifier decrypts shared score, sees tier, downloads receipt

## Smart Contracts

Deployed and verified on Arbitrum Sepolia:
- [ShipProof](https://sepolia.arbiscan.io/address/0x682c26075cbfa9d097A856dc9d2Ab450F5D8179e) — `0x682c26075cbfa9d097A856dc9d2Ab450F5D8179e`
- [ShipProofBadge](https://sepolia.arbiscan.io/address/0x376dF458691673adcD7D8dC166D278464bf79E7E) — `0x376dF458691673adcD7D8dC166D278464bf79E7E`

### ShipProof.sol

Core attestation contract. 46 FHE calls across 12 operation types.

| Function | Description |
|----------|-------------|
| `submitAttestation(meta, configs, encInputs, oracleSig)` | Submit encrypted metrics with EIP-712 oracle signature |
| `computeScore(attestationId)` | Normalize and weight each metric on ciphertext: `min(raw, cap) * SCALE / cap * weight` |
| `computePass(attestationId)` | Compare encrypted score against threshold via `FHE.gte` |
| `publishPassDecryptResult(attestationId, result, sig)` | Publish CoFHE-signed decryption of pass/fail boolean |
| `mintBadge(attestationId)` | Mint soulbound badge if pass verified. Computes tier via 3x `FHE.gte` + 3x `FHE.select` |
| `grantScoreAccess(attestationId, grantee)` | Allow an address to decrypt the encrypted score |
| `grantMetricAccess(attestationId, slotIndex, grantee)` | Allow an address to decrypt a specific encrypted metric |

Lifecycle: None → Submitted → ScoreComputed → PassComputed → DecryptRequested → BadgeMinted

Source-agnostic design: metrics stored as a flat array of up to 16 encrypted uint32 slots. The contract doesn't know what "GitHub commits" or "X followers" means — it computes on encrypted values with configurable caps and weights. New providers require no contract changes.

### ShipProofBadge.sol

Soulbound ERC-721. Only mintable by ShipProof contract. Transfers blocked. Each token maps to an attestation ID.

## Providers

Providers implement the `MetricProvider` interface. Adding a new provider requires no contract changes.

### GitHub (5 metrics)

| Metric | Key | Cap | Weight | Source |
|--------|-----|-----|--------|--------|
| Commits | `gh_commits` | 500 | 2000 | GraphQL contributionsCollection |
| Pull Requests | `gh_prs` | 200 | 2500 | GraphQL contributionsCollection |
| Issues Opened | `gh_issues` | 100 | 500 | GraphQL contributionsCollection |
| Repo Breadth | `gh_repos` | 30 | 1000 | Unique repos contributed to |
| PR Reviews | `gh_pr_reviews` | 100 | 1000 | GraphQL contributionsCollection |

### X (3 metrics)

| Metric | Key | Cap | Weight | Source |
|--------|-----|-----|--------|--------|
| Followers | `x_followers` | configurable | configurable | Users API v2 |
| Ship Posts | `x_ship_posts` | configurable | configurable | Tweets matching shipping patterns |
| Tweet Count | `x_tweet_count` | configurable | configurable | Total tweets in window |

Ship posts detected by regex: "shipped", "launching", "released", "open sourced", GitHub URLs, commit SHAs.

## Project Structure

```
ShipProof/
├── apps/
│   ├── server/              # Oracle service (Bun + Hono)
│   │   ├── src/
│   │   │   ├── routes/      # auth (OAuth), attest (envelope), wallet (linking)
│   │   │   ├── providers/   # GitHub, X — pluggable MetricProvider interface
│   │   │   ├── attestation/ # pipeline, encrypt (@cofhe/sdk/node), sign (EIP-712)
│   │   │   ├── auth/        # wallet linking + signature verification
│   │   │   └── session.ts   # signed cookie sessions
│   │   └── test/            # 36 tests
│   │
│   └── web/                 # Frontend (React 19 + Vite)
│       └── src/
│           ├── routes/      # / (landing), /attest, /verify, /verify/$attestationId, /badge/$id
│           ├── components/  # AttestationStepper, VerifyBadgeCard, SelectiveDisclosure,
│           │                # PermitGate, ConnectWallet, ProviderConnector, WalletLinker
│           ├── hooks/       # useDecryptScore (custom CoFHE decrypt)
│           └── lib/         # contracts, tier, errors, metrics-version, receipt
│
├── contracts/               # Solidity (Foundry)
│   ├── src/
│   │   ├── ShipProof.sol    # Core FHE attestation + scoring + disclosure
│   │   └── ShipProofBadge.sol  # Soulbound ERC-721
│   ├── test/                # 46 tests (CoFHE mock environment)
│   └── script/              # Deployment scripts
│
├── packages/
│   ├── env/                 # Zod-validated environment schemas (server + web)
│   ├── ui/                  # Shared shadcn/ui components
│   └── config/              # Shared TypeScript + Tailwind config
│
└── lib/                     # Git submodules
    ├── cofhe-contracts/     # Fhenix CoFHE v0.1.3
    ├── cofhe-mock-contracts/  # FHE mocks for local testing
    └── openzeppelin-contracts/  # OpenZeppelin v5.6.1
```

## Attestation Flow (5 transactions)

| Tx | Contract Call | What Happens |
|----|--------------|--------------|
| 1 | `submitAttestation` | Encrypted metrics + oracle signature stored on-chain |
| 2 | `computeScore` | Weighted scoring on encrypted data (FHE.min, FHE.mul, FHE.div, FHE.add) |
| 3 | `computePass` | Encrypted score compared to threshold (FHE.gte) |
| 4 | `publishPassDecryptResult` | CoFHE-signed decryption of pass/fail boolean |
| 5 | `mintBadge` | If passed: mint soulbound NFT, compute tier (Bronze/Silver/Gold/Diamond) |

Frontend auto-chains all 5 with a single button click. Resumable from any step on error or page reload.

## Trust Model

- The oracle sees plaintext metrics during collection — this is the trust boundary
- Once encrypted and submitted, the oracle cannot read or modify scores
- EIP-712 signature binds attestation to a whitelisted oracle address
- Weights and caps are supplied per attestation via the oracle envelope
- Scoring logic (normalization, aggregation, tier computation) is on-chain
- Anti-sybil: identity hash from provider userIds + salt prevents duplicate attestations
- Replay protection: oracle nonce prevents envelope reuse
- Expiration: attestation envelopes expire
- Soulbound badges: non-transferable
- Constant-time tier computation: 3x `FHE.gte` + 3x `FHE.select`, no branch leakage

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

forge test

source .env
forge script script/DeployShipProof.s.sol \
  --rpc-url $ARB_SEPOLIA_RPC_URL \
  --broadcast \
  --verify
```

### Server

```bash
cd apps/server
# Configure .env (see .env.example)
bun run dev
```

### Frontend

```bash
cd apps/web
# Configure .env (see .env.example)
bun run dev
```

## Testing

```bash
# Smart contracts (46 tests)
cd contracts && forge test

# Server (36 tests)
bun test apps/server/

# Type check
bun run check-types
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Contracts | Solidity 0.8.31, Foundry, CoFHE v0.1.3, OpenZeppelin v5.6.1 |
| Server | Bun, Hono, @cofhe/sdk/node, viem, Zod |
| Frontend | React 19, Vite, TanStack Router, TanStack Query, wagmi, @cofhe/sdk, shadcn/ui, Tailwind CSS v4 |
| Chain | Arbitrum Sepolia (421614) |
| Infra | Caddy, Docker Compose |
| Monorepo | Bun workspaces, Turborepo |

## License

MIT
