import type {
  MetricProvider,
  ProviderResult,
  ProviderTokens,
  RawMetric,
} from "./types";

const METRIC_DEFS = [
  {
    key: "gh_commits",
    label: "Commits",
    cap: 500,
    weight: 2000,
    field: "totalCommitContributions",
  },
  {
    key: "gh_issues",
    label: "Issues opened",
    cap: 100,
    weight: 500,
    field: "totalIssueContributions",
  },
  {
    key: "gh_prs",
    label: "Pull requests",
    cap: 200,
    weight: 2500,
    field: "totalPullRequestContributions",
  },
  {
    key: "gh_repo_breadth",
    label: "Repos contributed to",
    cap: 30,
    weight: 1000,
    field: "totalRepositoriesWithContributedCommits",
  },
  {
    key: "gh_reviews",
    label: "PR reviews",
    cap: 100,
    weight: 1000,
    field: "totalPullRequestReviewContributions",
  },
] as const;

// Pre-sorted by key for canonical slot ordering.
const SORTED_DEFS = [...METRIC_DEFS].sort((a, b) =>
  a.key.localeCompare(b.key),
);

const CONTRIBUTIONS_QUERY = `
  query($login: String!, $from: DateTime!, $to: DateTime!) {
    user(login: $login) {
      contributionsCollection(from: $from, to: $to) {
        totalCommitContributions
        totalPullRequestContributions
        totalIssueContributions
        totalPullRequestReviewContributions
        totalRepositoriesWithContributedCommits
      }
    }
  }
`;

export class GitHubProvider implements MetricProvider {
  readonly id = "github";
  readonly displayName = "GitHub";
  readonly requiredScopes = ["read:user"];

  constructor(
    private readonly clientId: string,
    private readonly clientSecret: string,
  ) {}

  getAuthUrl(state: string, redirectUri: string): string {
    const params = new URLSearchParams({
      client_id: this.clientId,
      redirect_uri: redirectUri,
      scope: "read:user",
      state,
    });
    return `https://github.com/login/oauth/authorize?${params.toString()}`;
  }

  async exchangeCode(
    code: string,
    redirectUri: string,
  ): Promise<ProviderTokens> {
    const res = await fetch("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        client_id: this.clientId,
        client_secret: this.clientSecret,
        code,
        redirect_uri: redirectUri,
      }),
    });

    if (!res.ok) {
      throw new Error(`GitHub token exchange failed: ${res.status}`);
    }

    const data = (await res.json()) as {
      access_token?: string;
      error?: string;
    };

    if (!data.access_token) {
      throw new Error(
        `GitHub token exchange error: ${data.error ?? "no access_token"}`,
      );
    }

    return { accessToken: data.access_token };
  }

  async getUserId(tokens: ProviderTokens): Promise<string> {
    const res = await fetch("https://api.github.com/user", {
      headers: {
        Authorization: `Bearer ${tokens.accessToken}`,
        Accept: "application/vnd.github+json",
      },
    });

    if (!res.ok) {
      throw new Error(`GitHub user fetch failed: ${res.status}`);
    }

    const data = (await res.json()) as { login: string };
    return data.login;
  }

  async fetchMetrics(
    tokens: ProviderTokens,
    userId: string,
    window: { from: Date; to: Date },
  ): Promise<ProviderResult> {
    const res = await fetch("https://api.github.com/graphql", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${tokens.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query: CONTRIBUTIONS_QUERY,
        variables: {
          login: userId,
          from: window.from.toISOString(),
          to: window.to.toISOString(),
        },
      }),
    });

    if (!res.ok) {
      throw new Error(`GitHub GraphQL request failed: ${res.status}`);
    }

    const body = (await res.json()) as {
      data?: {
        user?: {
          contributionsCollection?: Record<string, number>;
        };
      };
      errors?: { message: string }[];
    };

    if (body.errors?.length) {
      throw new Error(`GitHub GraphQL error: ${body.errors[0]!.message}`);
    }

    const collection = body.data?.user?.contributionsCollection ?? {};

    const metrics: RawMetric[] = SORTED_DEFS.map((def) => ({
      key: def.key,
      label: def.label,
      value: collection[def.field] ?? 0,
      cap: def.cap,
      weight: def.weight,
    }));

    return {
      providerId: this.id,
      userId,
      metrics,
    };
  }
}
