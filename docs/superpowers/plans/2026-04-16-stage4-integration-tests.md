# Stage 4 Integration Tests — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fill remaining Stage 4 test gaps — 3 missing Foundry tests, 5 missing provider/pipeline edge-case tests, and a gas profiling report.

**Architecture:** Add tests to existing test files (no new files except the gas report). Foundry tests follow existing `ShipProofTestHelper` patterns. Server tests use `bun:test` with mocked `globalThis.fetch`.

**Tech Stack:** Foundry (Solidity tests), Bun (TypeScript tests), existing test helpers

---

### Task 1: Foundry — `test_submitAttestation_revert_zeroWeight`

**Files:**
- Modify: `contracts/test/ShipProof.t.sol` (after line 81, the existing `test_submitAttestation_revert_zeroCap`)

- [ ] **Step 1: Write the test**

Add after the `test_submitAttestation_revert_zeroCap` test:

```solidity
function test_submitAttestation_revert_zeroWeight() public {
    AttestationMeta memory meta = _makeMeta(alice, 1, 1);
    MetricConfig[] memory configs = new MetricConfig[](1);
    configs[0] = MetricConfig({cap: 100, weight: 0});
    InEuint32[] memory inputs = _makeEncInputs(1, 50, alice);
    bytes memory sig = _signAttestation(meta, configs, inputs);

    vm.prank(alice);
    vm.expectRevert(ShipProof.InvalidConfig.selector);
    sp.submitAttestation(meta, configs, inputs, sig);
}
```

- [ ] **Step 2: Run test to verify it passes**

Run: `cd /home/Cifr/Projects/ShipProof/contracts && forge test --match-test test_submitAttestation_revert_zeroWeight -vv`
Expected: PASS — the contract already checks `configs[i].weight == 0` in the `InvalidConfig` guard at line 176.

- [ ] **Step 3: Commit**

```bash
git add contracts/test/ShipProof.t.sol
git commit -m "test: add zero-weight config revert test"
```

---

### Task 2: Foundry — `test_submitAttestation_revert_invalidSignature`

**Files:**
- Modify: `contracts/test/ShipProof.t.sol` (after the zero-weight test from Task 1)

- [ ] **Step 1: Write the test**

```solidity
function test_submitAttestation_revert_invalidSignature() public {
    AttestationMeta memory meta = _makeMeta(alice, 1, 1);
    MetricConfig[] memory configs = _makeConfigs(1, 100, 5000);
    InEuint32[] memory inputs = _makeEncInputs(1, 50, alice);

    // Sign with a random non-oracle key
    uint256 fakeKey = 0xDEAD;
    bytes32 structHash = keccak256(abi.encode(
        sp.ATTESTATION_TYPEHASH(),
        meta.identityHash,
        meta.fromTs,
        meta.toTs,
        meta.metricCount,
        meta.metricsVersion,
        meta.scoringVersion,
        meta.wallet,
        meta.oracleNonce,
        meta.expiresAt,
        _configHash(configs),
        _ctInputsHash(inputs)
    ));
    bytes32 digest = MessageHashUtils.toTypedDataHash(sp.getDomainSeparator(), structHash);
    (uint8 v, bytes32 r, bytes32 s) = vm.sign(fakeKey, digest);
    bytes memory fakeSig = abi.encodePacked(r, s, v);

    vm.prank(alice);
    vm.expectRevert(ShipProof.InvalidSignature.selector);
    sp.submitAttestation(meta, configs, inputs, fakeSig);
}
```

- [ ] **Step 2: Add MessageHashUtils import if not present**

The import `{MessageHashUtils}` from `@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol` is already in `ShipProofTestHelper.sol` — it's available in the test contract via inheritance.

- [ ] **Step 3: Run test to verify it passes**

Run: `cd /home/Cifr/Projects/ShipProof/contracts && forge test --match-test test_submitAttestation_revert_invalidSignature -vv`
Expected: PASS — signer recovered from `fakeSig` won't be in `isOracle`, triggering `InvalidSignature`.

- [ ] **Step 4: Commit**

```bash
git add contracts/test/ShipProof.t.sol
git commit -m "test: add invalid oracle signature revert test"
```

---

### Task 3: Foundry — `test_fullFlow_failingScore`

**Files:**
- Modify: `contracts/test/ShipProof.t.sol` (after `test_lifecycle_submitToPass`)

- [ ] **Step 1: Write the test**

```solidity
function test_fullFlow_failingScore() public {
    // value=10, cap=100, weight=10000 → score=1000, threshold=4000 → fail
    bytes32 id = _submitAttestation(alice, 1, 10, 100, 10000, 1);

    vm.prank(alice);
    sp.computeScore(id);
    euint32 score = sp.getEncScore(id);
    assertHashValue(score, 1000);

    vm.prank(alice);
    sp.computePass(id);

    vm.prank(alice);
    sp.requestPassDecryption(id);

    vm.warp(block.timestamp + 11);

    // Badge mint should revert — score below threshold
    vm.prank(alice);
    vm.expectRevert(ShipProof.ScoreBelowThreshold.selector);
    sp.mintBadge(id);
}
```

- [ ] **Step 2: Run test to verify it passes**

Run: `cd /home/Cifr/Projects/ShipProof/contracts && forge test --match-test test_fullFlow_failingScore -vv`
Expected: PASS — score 1000 < threshold 4000 triggers `ScoreBelowThreshold`.

- [ ] **Step 3: Commit**

```bash
git add contracts/test/ShipProof.t.sol
git commit -m "test: add full flow failing score lifecycle test"
```

---

### Task 4: Server — GitHub rate limit and empty window tests

**Files:**
- Modify: `apps/server/test/providers/github.test.ts`

- [ ] **Step 1: Write the rate limit error test**

Add inside the `fetchMetrics` describe block:

```typescript
test("throws on non-ok GraphQL response (e.g. rate limit)", async () => {
  const provider = new GitHubProvider(CLIENT_ID, CLIENT_SECRET);

  let callCount = 0;
  globalThis.fetch = mock(() => {
    callCount++;
    if (callCount === 1) {
      // First call is the /user call for login lookup
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ login: "octocat" }),
      });
    }
    // Second call is the GraphQL call — simulate rate limit
    return Promise.resolve({
      ok: false,
      status: 403,
      json: () => Promise.resolve({ message: "API rate limit exceeded" }),
    });
  }) as unknown as typeof fetch;

  expect(
    provider.fetchMetrics(TOKENS, "octocat", {
      from: new Date("2024-01-01"),
      to: new Date("2024-12-31"),
    }),
  ).rejects.toThrow("GitHub GraphQL request failed: 403");
});
```

- [ ] **Step 2: Write the empty contribution window test**

```typescript
test("returns zero values for empty contribution window", async () => {
  const provider = new GitHubProvider(CLIENT_ID, CLIENT_SECRET);

  let callCount = 0;
  globalThis.fetch = mock(() => {
    callCount++;
    if (callCount === 1) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ login: "octocat" }),
      });
    }
    return Promise.resolve({
      ok: true,
      json: () =>
        Promise.resolve({
          data: {
            user: {
              contributionsCollection: {
                totalCommitContributions: 0,
                totalPullRequestContributions: 0,
                totalIssueContributions: 0,
                totalPullRequestReviewContributions: 0,
                totalRepositoriesWithContributedCommits: 0,
              },
            },
          },
        }),
    });
  }) as unknown as typeof fetch;

  const result = await provider.fetchMetrics(TOKENS, "octocat", {
    from: new Date("2024-01-01"),
    to: new Date("2024-12-31"),
  });

  for (const metric of result.metrics) {
    expect(metric.value).toBe(0);
  }
  expect(result.metrics).toHaveLength(5);
});
```

- [ ] **Step 3: Run tests**

Run: `cd /home/Cifr/Projects/ShipProof && bun test apps/server/test/providers/github.test.ts`
Expected: All tests pass.

- [ ] **Step 4: Commit**

```bash
git add apps/server/test/providers/github.test.ts
git commit -m "test: add GitHub rate limit and empty window tests"
```

---

### Task 5: Server — X zero tweets test

**Files:**
- Modify: `apps/server/test/providers/x.test.ts`

- [ ] **Step 1: Write the zero-tweets test**

Add inside the `fetchMetrics` describe block:

```typescript
it("handles zero tweets in window (empty data array)", async () => {
  let callCount = 0;
  globalThis.fetch = mock(async (_url: string | URL | Request) => {
    callCount += 1;
    if (callCount === 1) {
      return new Response(
        JSON.stringify({
          data: {
            id: userId,
            public_metrics: { tweet_count: 0, followers_count: 50 },
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }
    // No tweets — API returns no data field
    return new Response(JSON.stringify({}), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as any;

  const result = await provider.fetchMetrics(TOKENS, userId, window);

  const byKey = Object.fromEntries(result.metrics.map((m) => [m.key, m]));
  expect(byKey["x_ship_posts"]!.value).toBe(0);
  expect(byKey["x_tweet_count"]!.value).toBe(0);
  expect(byKey["x_followers"]!.value).toBe(50);
});
```

- [ ] **Step 2: Run tests**

Run: `cd /home/Cifr/Projects/ShipProof && bun test apps/server/test/providers/x.test.ts`
Expected: All tests pass.

- [ ] **Step 3: Commit**

```bash
git add apps/server/test/providers/x.test.ts
git commit -m "test: add X zero-tweets edge case test"
```

---

### Task 6: Server — Pipeline single-provider and metricsVersion tests

**Files:**
- Modify: `apps/server/test/attestation/pipeline.test.ts`

- [ ] **Step 1: Add import for `computeSchemaVersion`**

At the top of the file, update the import:

```typescript
import { buildIdentityHash, collectMetrics } from "../../src/attestation/pipeline";
import { computeSchemaVersion } from "../../src/attestation/encrypt";
import { registerProvider } from "../../src/providers/registry";
import type { MetricProvider } from "../../src/providers/types";
```

- [ ] **Step 2: Add a second test provider**

After the existing `testProvider` definition:

```typescript
const testProvider2: MetricProvider = {
  id: "test2",
  displayName: "Test2",
  requiredScopes: [],
  getAuthUrl: () => "",
  exchangeCode: async () => ({ accessToken: "test2" }),
  getUserId: async () => "user2",
  fetchMetrics: async (_, userId) => ({
    providerId: "test2",
    userId,
    metrics: [
      { key: "test2_x", label: "X", value: 10, cap: 50, weight: 3000 },
    ],
  }),
};
```

- [ ] **Step 3: Write the single-provider pipeline test**

```typescript
test("collectMetrics works with a single provider", async () => {
  registerProvider(testProvider);

  const sessions = {
    test: { tokens: { accessToken: "tok" }, userId: "user1" },
  };
  const window = { from: new Date("2025-01-01"), to: new Date("2025-12-31") };

  const metrics = await collectMetrics(sessions, window);
  expect(metrics).toHaveLength(2);
  expect(metrics.every((m) => m.key.startsWith("test_"))).toBe(true);
});
```

- [ ] **Step 4: Write the metricsVersion differs per combo test**

```typescript
test("computeSchemaVersion differs for different provider combos", () => {
  const githubOnly = computeSchemaVersion([
    "gh_commits",
    "gh_issues",
    "gh_prs",
    "gh_repo_breadth",
    "gh_reviews",
  ]);

  const githubPlusX = computeSchemaVersion([
    "gh_commits",
    "gh_issues",
    "gh_prs",
    "gh_repo_breadth",
    "gh_reviews",
    "x_followers",
    "x_ship_posts",
    "x_tweet_count",
  ]);

  expect(githubOnly).not.toBe(githubPlusX);
  expect(typeof githubOnly).toBe("number");
  expect(typeof githubPlusX).toBe("number");
});
```

- [ ] **Step 5: Run tests**

Run: `cd /home/Cifr/Projects/ShipProof && bun test apps/server/test/attestation/pipeline.test.ts`
Expected: All tests pass.

- [ ] **Step 6: Commit**

```bash
git add apps/server/test/attestation/pipeline.test.ts
git commit -m "test: add single-provider and metricsVersion pipeline tests"
```

---

### Task 7: Gas profiling report

**Files:**
- Create: `docs/gas-profiling-report.md`

- [ ] **Step 1: Run Foundry gas profiling tests with gas report**

Run: `cd /home/Cifr/Projects/ShipProof/contracts && forge test --match-test "test_gasProfile" --gas-report -vv 2>&1`

Capture the output — this gives mock-environment gas per function.

- [ ] **Step 2: Write the gas report**

Create `docs/gas-profiling-report.md` with the format:

```markdown
# ShipProof Gas Profiling Report

**Date:** 2026-04-16
**Environment:** Foundry + cofhe-mock-contracts (simulates FHE ops with plaintext arithmetic)
**Chain target:** Arbitrum Sepolia

## Mock Gas Estimates

| Operation | 1 Metric | 5 Metrics | 8 Metrics | 16 Metrics |
|---|---|---|---|---|
| submitAttestation | X gas | X gas | X gas | X gas |
| computeScore | X gas | X gas | X gas | X gas |
| computePass | X gas | — | — | — |
| requestPassDecryption + mintBadge | X gas | — | — | — |

## Notes

- Mock gas does NOT reflect real CoFHE coprocessor costs. Real FHE operations will be significantly more expensive.
- Mock contracts replace encrypted ops with plaintext arithmetic, so gas differences across metric counts reflect loop overhead and storage, not FHE compute.
- Real testnet profiling requires manual end-to-end runs on Arbitrum Sepolia (Stage 4.4 in DEVELOPMENT_SPEC.md).
- Contracts are already deployed and verified on Arbitrum Sepolia — see memory for addresses.

## Testnet Deployment

- ShipProof: `0x338Bd76EC463cF1eadc1f75b400271021Af837ec`
- ShipProofBadge: `0x059d92B5325b9c9FD5634aC18Bd759724d314263`
- Both verified on Arbiscan Sepolia.
```

Fill in actual gas numbers from the forge output.

- [ ] **Step 3: Commit**

```bash
git add docs/gas-profiling-report.md
git commit -m "docs: add mock gas profiling report"
```

---

### Task 8: Run full test suites to confirm nothing is broken

- [ ] **Step 1: Run all Foundry tests**

Run: `cd /home/Cifr/Projects/ShipProof/contracts && forge test -vv`
Expected: All tests pass (44+ tests including the 3 new ones).

- [ ] **Step 2: Run all server tests**

Run: `cd /home/Cifr/Projects/ShipProof && bun test apps/server/`
Expected: All tests pass.

- [ ] **Step 3: If any failures, fix and re-run before final commit**
