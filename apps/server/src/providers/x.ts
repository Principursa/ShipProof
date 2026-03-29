import { createHash, randomBytes } from "crypto";
import type {
  MetricProvider,
  ProviderResult,
  ProviderTokens,
  RawMetric,
} from "./types";

const SHIP_REGEX =
  /shipped|launching|released|just deployed|open.?sourced/i;
const GITHUB_URL_RE = /https?:\/\/github\.com\//i;
const COMMIT_SHA_RE = /\b[0-9a-f]{7,40}\b/i;

function isShipPost(text: string): boolean {
  return SHIP_REGEX.test(text) || GITHUB_URL_RE.test(text) || COMMIT_SHA_RE.test(text);
}

export class XProvider implements MetricProvider {
  readonly id = "x";
  readonly displayName = "X (Twitter)";
  readonly requiredScopes = ["tweet.read", "users.read", "offline.access"];

  private readonly clientId: string;
  private readonly clientSecret: string;

  constructor(clientId: string, clientSecret: string) {
    this.clientId = clientId;
    this.clientSecret = clientSecret;
  }

  getAuthUrl(state: string, redirectUri: string): { url: string; pkceVerifier: string } {
    const verifier = randomBytes(32).toString("base64url");

    const challenge = createHash("sha256")
      .update(verifier)
      .digest("base64url");

    const params = new URLSearchParams({
      response_type: "code",
      client_id: this.clientId,
      redirect_uri: redirectUri,
      scope: this.requiredScopes.join(" "),
      state,
      code_challenge: challenge,
      code_challenge_method: "S256",
    });

    return {
      url: `https://x.com/i/oauth2/authorize?${params.toString()}`,
      pkceVerifier: verifier,
    };
  }

  async exchangeCode(
    code: string,
    redirectUri: string,
    pkceVerifier?: string,
  ): Promise<ProviderTokens> {
    const verifier = pkceVerifier;

    const body = new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
      ...(verifier ? { code_verifier: verifier } : {}),
    });

    const credentials = Buffer.from(
      `${this.clientId}:${this.clientSecret}`,
    ).toString("base64");

    const res = await fetch("https://api.x.com/2/oauth2/token", {
      method: "POST",
      headers: {
        Authorization: `Basic ${credentials}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: body.toString(),
    });

    if (!res.ok) {
      throw new Error(`X token exchange failed: ${res.status}`);
    }

    const data = (await res.json()) as {
      access_token: string;
      refresh_token?: string;
      expires_in?: number;
    };

    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: data.expires_in
        ? Date.now() + data.expires_in * 1000
        : undefined,
    };
  }

  async getUserId(tokens: ProviderTokens): Promise<string> {
    const res = await fetch("https://api.x.com/2/users/me", {
      headers: { Authorization: `Bearer ${tokens.accessToken}` },
    });

    if (!res.ok) {
      throw new Error(`X getUserId failed: ${res.status}`);
    }

    const data = (await res.json()) as { data: { id: string } };
    return data.data.id;
  }

  async fetchMetrics(
    tokens: ProviderTokens,
    userId: string,
    window: { from: Date; to: Date },
  ): Promise<ProviderResult> {
    // 1. User public metrics
    const userRes = await fetch(
      `https://api.x.com/2/users/${userId}?user.fields=public_metrics`,
      { headers: { Authorization: `Bearer ${tokens.accessToken}` } },
    );

    if (!userRes.ok) {
      throw new Error(`X user metrics failed: ${userRes.status}`);
    }

    const userData = (await userRes.json()) as {
      data: {
        public_metrics: {
          tweet_count: number;
          followers_count: number;
        };
      };
    };

    const { tweet_count, followers_count } =
      userData.data.public_metrics;

    // 2. Recent tweets for ship post detection
    const tweetsParams = new URLSearchParams({
      max_results: "100",
      start_time: window.from.toISOString(),
      end_time: window.to.toISOString(),
    });

    const tweetsRes = await fetch(
      `https://api.x.com/2/users/${userId}/tweets?${tweetsParams.toString()}`,
      { headers: { Authorization: `Bearer ${tokens.accessToken}` } },
    );

    if (!tweetsRes.ok) {
      throw new Error(`X tweets fetch failed: ${tweetsRes.status}`);
    }

    const tweetsData = (await tweetsRes.json()) as {
      data?: Array<{ text: string }>;
    };

    const shipPostCount = (tweetsData.data ?? []).filter((t) =>
      isShipPost(t.text),
    ).length;

    const metrics: RawMetric[] = [
      {
        key: "x_followers",
        label: "X Followers",
        value: followers_count,
        cap: 5000,
        weight: 500,
      },
      {
        key: "x_ship_posts",
        label: "X Ship Posts",
        value: shipPostCount,
        cap: 50,
        weight: 2000,
      },
      {
        key: "x_tweet_count",
        label: "X Tweet Count",
        value: tweet_count,
        cap: 1000,
        weight: 500,
      },
    ];

    // Sort by key
    metrics.sort((a, b) => a.key.localeCompare(b.key));

    return { providerId: this.id, userId, metrics };
  }
}
