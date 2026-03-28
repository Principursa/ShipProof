import { describe, expect, mock, test } from "bun:test";
import { GitHubProvider } from "../../src/providers/github";
import type { ProviderTokens } from "../../src/providers/types";

const CLIENT_ID = "test-client-id";
const CLIENT_SECRET = "test-client-secret";

const TOKENS: ProviderTokens = { accessToken: "gho_test_token" };

describe("GitHubProvider", () => {
  test("id is 'github'", () => {
    const provider = new GitHubProvider(CLIENT_ID, CLIENT_SECRET);
    expect(provider.id).toBe("github");
  });

  test("displayName is 'GitHub'", () => {
    const provider = new GitHubProvider(CLIENT_ID, CLIENT_SECRET);
    expect(provider.displayName).toBe("GitHub");
  });

  describe("getAuthUrl", () => {
    test("returns a URL pointing to GitHub OAuth authorize endpoint", () => {
      const provider = new GitHubProvider(CLIENT_ID, CLIENT_SECRET);
      const url = provider.getAuthUrl("my-state", "https://example.com/cb");
      expect(url).toContain("https://github.com/login/oauth/authorize");
    });

    test("includes client_id param", () => {
      const provider = new GitHubProvider(CLIENT_ID, CLIENT_SECRET);
      const url = provider.getAuthUrl("my-state", "https://example.com/cb");
      expect(url).toContain(`client_id=${CLIENT_ID}`);
    });

    test("includes redirect_uri param", () => {
      const provider = new GitHubProvider(CLIENT_ID, CLIENT_SECRET);
      const url = provider.getAuthUrl("my-state", "https://example.com/cb");
      expect(url).toContain("redirect_uri=");
      expect(url).toContain("example.com");
    });

    test("includes scope=read%3Auser or read:user", () => {
      const provider = new GitHubProvider(CLIENT_ID, CLIENT_SECRET);
      const url = provider.getAuthUrl("my-state", "https://example.com/cb");
      // URLSearchParams encodes ':' as '%3A'
      expect(url).toMatch(/scope=read(%3A|:)user/);
    });

    test("includes state param", () => {
      const provider = new GitHubProvider(CLIENT_ID, CLIENT_SECRET);
      const url = provider.getAuthUrl("my-state", "https://example.com/cb");
      expect(url).toContain("state=my-state");
    });
  });

  describe("fetchMetrics", () => {
    test("returns 5 metrics with correct keys sorted alphabetically", async () => {
      const provider = new GitHubProvider(CLIENT_ID, CLIENT_SECRET);

      const mockFetch = mock(() =>
        Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              data: {
                user: {
                  contributionsCollection: {
                    totalCommitContributions: 123,
                    totalPullRequestContributions: 45,
                    totalIssueContributions: 10,
                    totalPullRequestReviewContributions: 20,
                    totalRepositoriesWithContributedCommits: 7,
                  },
                },
              },
            }),
        }),
      );

      globalThis.fetch = mockFetch as unknown as typeof fetch;

      const result = await provider.fetchMetrics(
        TOKENS,
        "octocat",
        { from: new Date("2024-01-01"), to: new Date("2024-12-31") },
      );

      expect(result.providerId).toBe("github");
      expect(result.userId).toBe("octocat");
      expect(result.metrics).toHaveLength(5);

      const keys = result.metrics.map((m) => m.key);
      expect(keys).toEqual([
        "gh_commits",
        "gh_issues",
        "gh_prs",
        "gh_repo_breadth",
        "gh_reviews",
      ]);
    });

    test("metric values are correctly mapped from GraphQL response", async () => {
      const provider = new GitHubProvider(CLIENT_ID, CLIENT_SECRET);

      const mockFetch = mock(() =>
        Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              data: {
                user: {
                  contributionsCollection: {
                    totalCommitContributions: 123,
                    totalPullRequestContributions: 45,
                    totalIssueContributions: 10,
                    totalPullRequestReviewContributions: 20,
                    totalRepositoriesWithContributedCommits: 7,
                  },
                },
              },
            }),
        }),
      );

      globalThis.fetch = mockFetch as unknown as typeof fetch;

      const result = await provider.fetchMetrics(
        TOKENS,
        "octocat",
        { from: new Date("2024-01-01"), to: new Date("2024-12-31") },
      );

      const byKey = Object.fromEntries(result.metrics.map((m) => [m.key, m]));

      expect(byKey["gh_commits"]!.value).toBe(123);
      expect(byKey["gh_prs"]!.value).toBe(45);
      expect(byKey["gh_issues"]!.value).toBe(10);
      expect(byKey["gh_reviews"]!.value).toBe(20);
      expect(byKey["gh_repo_breadth"]!.value).toBe(7);
    });

    test("metrics have correct caps", async () => {
      const provider = new GitHubProvider(CLIENT_ID, CLIENT_SECRET);

      const mockFetch = mock(() =>
        Promise.resolve({
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
        }),
      );

      globalThis.fetch = mockFetch as unknown as typeof fetch;

      const result = await provider.fetchMetrics(
        TOKENS,
        "octocat",
        { from: new Date("2024-01-01"), to: new Date("2024-12-31") },
      );

      const byKey = Object.fromEntries(result.metrics.map((m) => [m.key, m]));

      expect(byKey["gh_commits"]!.cap).toBe(500);
      expect(byKey["gh_prs"]!.cap).toBe(200);
      expect(byKey["gh_issues"]!.cap).toBe(100);
      expect(byKey["gh_reviews"]!.cap).toBe(100);
      expect(byKey["gh_repo_breadth"]!.cap).toBe(30);
    });

    test("metrics have correct weights", async () => {
      const provider = new GitHubProvider(CLIENT_ID, CLIENT_SECRET);

      const mockFetch = mock(() =>
        Promise.resolve({
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
        }),
      );

      globalThis.fetch = mockFetch as unknown as typeof fetch;

      const result = await provider.fetchMetrics(
        TOKENS,
        "octocat",
        { from: new Date("2024-01-01"), to: new Date("2024-12-31") },
      );

      const byKey = Object.fromEntries(result.metrics.map((m) => [m.key, m]));

      expect(byKey["gh_commits"]!.weight).toBe(2000);
      expect(byKey["gh_prs"]!.weight).toBe(2500);
      expect(byKey["gh_issues"]!.weight).toBe(500);
      expect(byKey["gh_reviews"]!.weight).toBe(1000);
      expect(byKey["gh_repo_breadth"]!.weight).toBe(1000);
    });
  });
});
