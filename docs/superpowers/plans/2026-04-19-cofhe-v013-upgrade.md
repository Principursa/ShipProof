# CoFHE v0.1.3 Upgrade — Implementation Plan (Completed)

**Status:** Complete
**Date:** 2026-04-19
**Goal:** Upgrade Fhenix CoFHE integration from v0.0.13 to v0.1.3 to fix broken decryption flow on Arbitrum Sepolia.

---

## What Changed

### Solidity Contracts
- Upgraded `lib/cofhe-contracts` submodule from v0.0.13 to v0.1.3
- Upgraded `lib/cofhe-mock-contracts` submodule from v0.3.0 to v0.3.1
- Patched mock contracts for v0.1.3 compatibility (bytes32 types, removed euint256, added ITaskManager stubs)
- Replaced `requestPassDecryption` → `publishPassDecryptResult` in `ShipProof.sol`
  - Old: `FHE.decrypt(passed)` (removed in v0.1.3)
  - New: `FHE.publishDecryptResult(passed, result, signature)` with CoFHE-signed proof
- All 46 tests pass

### Contract Deployment
- New ShipProof: `0x682c26075cbfa9d097A856dc9d2Ab450F5D8179e`
- New ShipProofBadge: `0x376dF458691673adcD7D8dC166D278464bf79E7E`
- Deploy block: `261094805`
- Threshold lowered to 2000 via `updateThreshold`

### Frontend
- Updated ABI: return types changed from `uint256` to `bytes32` for encrypted handles
- Replaced `requestPassDecryption` with `publishPassDecryptResult` in ABI
- Rewrote attestation stepper decrypt step to use `@cofhe/sdk` `decryptForTx` builder
- Added retry logic for CoFHE 428 (Precondition Required) errors
- Built custom `useDecryptScore` hook to bypass broken `useCofheReadContractAndDecrypt`
- `@cofhe/react` 0.4.0 hooks incompatible with bytes32 handle types (Fhenix issue)

### Known Issues
- `useCofheReadContractAndDecrypt` from `@cofhe/react` does not work with v0.1.3 bytes32 handles
- Workaround: custom `useDecryptScore` hook using `cofheClient.decryptForTx()` directly
- Beta `@cofhe/react@0.0.0-beta-20260417095940` has same issue — waiting on Fhenix fix
