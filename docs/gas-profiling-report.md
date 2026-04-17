# ShipProof Gas Profiling Report

**Date:** 2026-04-16
**Environment:** Foundry + cofhe-mock-contracts (simulates FHE ops with plaintext arithmetic)
**Chain target:** Arbitrum Sepolia

## Mock Gas Estimates

### submitAttestation

| Metric Count | Total Test Gas | Notes |
|---|---|---|
| 1 | 556,160 | Single metric baseline |
| 5 | 1,666,501 | GitHub-only (5 metrics) |
| 8 | 2,502,675 | GitHub + X combined |
| 16 | 4,750,568 | Max capacity |

**Per-metric overhead:** ~278K gas per additional metric (linear scaling from storage + FHE handle creation).

### computeScore

| Metric Count | Total Test Gas | Notes |
|---|---|---|
| 1 | 3,294,620 | Single metric baseline |
| 5 | 12,630,666 | ~2.3M per additional metric |
| 8 | 19,588,459 | ~2.3M per additional metric |
| 16 | 38,153,194 | ~2.3M per additional metric |

**Per-metric overhead:** ~2.3M gas per metric (FHE min, mul, div, add operations per slot).

### Other Operations

| Operation | Gas |
|---|---|
| computePass | ~504K |
| requestPassDecryption | ~129K |
| mintBadge | ~182K |

### Contract Deployment

| Contract | Deployment Gas | Size (bytes) |
|---|---|---|
| ShipProof | 5,773,290 | 27,232 |
| ShipProofBadge | 2,152,633 | 10,776 |

## Important Caveats

- **Mock gas does NOT reflect real CoFHE coprocessor costs.** Real FHE operations are significantly more expensive than plaintext arithmetic. These numbers represent Solidity execution overhead only.
- Mock contracts replace encrypted ops with plaintext arithmetic, so gas differences across metric counts reflect loop overhead and storage writes, not actual FHE compute.
- `computeScore` dominates gas cost — it performs 4 FHE operations per metric (min, mul, div, add). On real CoFHE, each of these is an async coprocessor call with substantially higher gas.
- Real testnet profiling requires manual end-to-end runs on Arbitrum Sepolia. The contracts are deployed and verified — see below.

## Testnet Deployment

- **ShipProof:** `0x338Bd76EC463cF1eadc1f75b400271021Af837ec` (verified on Arbiscan)
- **ShipProofBadge:** `0x059d92B5325b9c9FD5634aC18Bd759724d314263` (verified on Arbiscan)
- **Deployer/Oracle:** `0x3B7CFFc2BAfAAEFB8d6a74C5B156C7cF7097514D`

## Scaling Assessment

At 16 metrics (max capacity), `submitAttestation` + `computeScore` totals ~43M mock gas. On Arbitrum Sepolia with real CoFHE, expect this to be higher but still feasible given Arbitrum's gas limits. The 8-metric configuration (GitHub + X) at ~22M mock gas is the practical default and well within limits.
