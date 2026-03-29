import { describe, it, expect, beforeEach, mock } from "bun:test";
import { XProvider } from "../../src/providers/x";
import type { ProviderTokens } from "../../src/providers/types";

const CLIENT_ID = "test-client-id";
const CLIENT_SECRET = "test-client-secret";

const TOKENS: ProviderTokens = {
  accessToken: "test-access-token",
};

describe("XProvider", () => {
  let provider: XProvider;

  beforeEach(() => {
    provider = new XProvider(CLIENT_ID, CLIENT_SECRET);
  });

  it('has id "x"', () => {
    expect(provider.id).toBe("x");
  });

  it('has displayName "X (Twitter)"', () => {
    expect(provider.displayName).toBe("X (Twitter)");
  });

  describe("getAuthUrl", () => {
    it("returns an object with url pointing to X OAuth2 authorize endpoint", () => {
      const result = provider.getAuthUrl("state123", "https://example.com/cb");
      expect(result.url).toStartWith("https://x.com/i/oauth2/authorize?");
      expect(result.pkceVerifier).toBeTruthy();
    });

    it("includes response_type=code", () => {
      const result = provider.getAuthUrl("state-abc", "https://example.com/cb");
      const params = new URL(result.url).searchParams;
      expect(params.get("response_type")).toBe("code");
    });

    it("includes PKCE code_challenge", () => {
      const result = provider.getAuthUrl("state-pkce", "https://example.com/cb");
      const params = new URL(result.url).searchParams;
      expect(params.get("code_challenge")).toBeTruthy();
      expect(params.get("code_challenge_method")).toBe("S256");
    });

    it("includes the provided state", () => {
      const state = "unique-state-xyz";
      const result = provider.getAuthUrl(state, "https://example.com/cb");
      const params = new URL(result.url).searchParams;
      expect(params.get("state")).toBe(state);
    });

    it("generates a different code_challenge for each call", () => {
      const result1 = provider.getAuthUrl("s1", "https://example.com/cb");
      const result2 = provider.getAuthUrl("s2", "https://example.com/cb");
      const challenge1 = new URL(result1.url).searchParams.get("code_challenge");
      const challenge2 = new URL(result2.url).searchParams.get("code_challenge");
      expect(challenge1).not.toBe(challenge2);
    });
  });

  describe("fetchMetrics", () => {
    const userId = "123456789";
    const window = {
      from: new Date("2024-01-01T00:00:00Z"),
      to: new Date("2024-01-31T23:59:59Z"),
    };

    const userMetricsResponse = {
      data: {
        id: userId,
        public_metrics: {
          tweet_count: 420,
          followers_count: 1800,
        },
      },
    };

    const tweetsResponse = {
      data: [
        { text: "Just pushed a new feature — check it out on https://github.com/user/repo" },
        { text: "Released v2.0 of my open source project!" },
        { text: "Hot take: tabs are better than spaces" },
        { text: "Coffee is my favourite debugging tool" },
      ],
    };

    beforeEach(() => {
      let callCount = 0;
      globalThis.fetch = mock(async (_url: string | URL | Request) => {
        callCount += 1;
        if (callCount === 1) {
          return new Response(JSON.stringify(userMetricsResponse), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }
        return new Response(JSON.stringify(tweetsResponse), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }) as any;
    });

    it("returns a ProviderResult with providerId 'x'", async () => {
      const result = await provider.fetchMetrics(TOKENS, userId, window);
      expect(result.providerId).toBe("x");
    });

    it("returns the correct userId", async () => {
      const result = await provider.fetchMetrics(TOKENS, userId, window);
      expect(result.userId).toBe(userId);
    });

    it("returns exactly 3 metrics", async () => {
      const result = await provider.fetchMetrics(TOKENS, userId, window);
      expect(result.metrics).toHaveLength(3);
    });

    it("returns metrics sorted by key", async () => {
      const result = await provider.fetchMetrics(TOKENS, userId, window);
      const keys = result.metrics.map((m) => m.key);
      expect(keys).toEqual(["x_followers", "x_ship_posts", "x_tweet_count"]);
    });

    it("returns correct x_followers value and metadata", async () => {
      const result = await provider.fetchMetrics(TOKENS, userId, window);
      const metric = result.metrics.find((m) => m.key === "x_followers")!;
      expect(metric.value).toBe(1800);
      expect(metric.cap).toBe(5000);
      expect(metric.weight).toBe(500);
    });

    it("returns correct x_tweet_count value and metadata", async () => {
      const result = await provider.fetchMetrics(TOKENS, userId, window);
      const metric = result.metrics.find((m) => m.key === "x_tweet_count")!;
      expect(metric.value).toBe(420);
      expect(metric.cap).toBe(1000);
      expect(metric.weight).toBe(500);
    });

    it("detects 2 ship posts from test tweets", async () => {
      const result = await provider.fetchMetrics(TOKENS, userId, window);
      const metric = result.metrics.find((m) => m.key === "x_ship_posts")!;
      // Tweet 1: GitHub URL → ship post
      // Tweet 2: "Released" keyword → ship post
      // Tweets 3 & 4: no signals → not ship posts
      expect(metric.value).toBe(2);
      expect(metric.cap).toBe(50);
      expect(metric.weight).toBe(2000);
    });

    it("makes exactly 2 fetch calls", async () => {
      let callCount = 0;
      globalThis.fetch = mock(async (_url: string | URL | Request) => {
        callCount += 1;
        if (callCount === 1) {
          return new Response(JSON.stringify(userMetricsResponse), {
            status: 200,
          });
        }
        return new Response(JSON.stringify(tweetsResponse), { status: 200 });
      }) as any;

      await provider.fetchMetrics(TOKENS, userId, window);
      expect(callCount).toBe(2);
    });
  });
});
