import { describe, test, expect } from "bun:test";
import { Hono } from "hono";
import { registerProvider } from "../../src/providers/registry";
import type { MetricProvider } from "../../src/providers/types";

const mockProvider: MetricProvider = {
  id: "mock",
  displayName: "Mock Provider",
  requiredScopes: ["read"],
  getAuthUrl: (state, redirectUri) => `https://mock.com/auth?state=${state}&redirect_uri=${redirectUri}`,
  exchangeCode: async () => ({ accessToken: "mock_token" }),
  getUserId: async () => "mock_user_123",
  fetchMetrics: async (_, userId) => ({
    providerId: "mock",
    userId,
    metrics: [{ key: "mock_metric", label: "Mock", value: 42, cap: 100, weight: 10000 }],
  }),
};

describe("Auth routes", () => {
  test("GET /auth/providers lists registered providers", async () => {
    registerProvider(mockProvider);
    const { createAuthRouter } = await import("../../src/routes/auth");
    const app = new Hono();
    app.route("/auth", createAuthRouter("http://localhost:3001", "a]veryverylongsecretthatis32chars!!"));
    const res = await app.request("/auth/providers");
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(Array.isArray(data)).toBe(true);
    const ids = data.map((p: any) => p.id);
    expect(ids).toContain("mock");
  });
});
