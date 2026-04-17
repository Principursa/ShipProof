import { describe, test, expect } from "bun:test";
import { buildIdentityHash, collectMetrics } from "../../src/attestation/pipeline";
import { registerProvider } from "../../src/providers/registry";
import type { MetricProvider } from "../../src/providers/types";
import { computeSchemaVersion } from "../../src/attestation/encrypt";

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

const testProvider: MetricProvider = {
  id: "test",
  displayName: "Test",
  requiredScopes: [],
  getAuthUrl: () => "",
  exchangeCode: async () => ({ accessToken: "test" }),
  getUserId: async () => "user1",
  fetchMetrics: async (_, userId) => ({
    providerId: "test",
    userId,
    metrics: [
      { key: "test_b", label: "B", value: 30, cap: 200, weight: 5000 },
      { key: "test_a", label: "A", value: 50, cap: 100, weight: 5000 },
    ],
  }),
};

describe("Attestation pipeline", () => {
  test("buildIdentityHash is deterministic regardless of key order", () => {
    const salt = "test_salt_16chars_ok";
    const hash1 = buildIdentityHash(salt, { test: "user1", github: "user2" });
    const hash2 = buildIdentityHash(salt, { github: "user2", test: "user1" });
    expect(hash1).toBe(hash2);
  });

  test("buildIdentityHash differs with different salts", () => {
    const hash1 = buildIdentityHash("salt_one_16chars!", { test: "user1" });
    const hash2 = buildIdentityHash("salt_two_16chars!", { test: "user1" });
    expect(hash1).not.toBe(hash2);
  });

  test("collectMetrics gathers from all providers and sorts by key", async () => {
    registerProvider(testProvider);

    const sessions = {
      test: { tokens: { accessToken: "tok" }, userId: "user1" },
    };
    const window = { from: new Date("2025-01-01"), to: new Date("2025-12-31") };

    const metrics = await collectMetrics(sessions, window);

    expect(metrics).toHaveLength(2);
    expect(metrics[0]!.key).toBe("test_a");
    expect(metrics[1]!.key).toBe("test_b");
  });

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
});
