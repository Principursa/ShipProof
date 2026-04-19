interface MetricsVersionInfo {
  providers: string[];
  metricCount: number;
}

/**
 * Static map of metricsVersion (uint32 as hex) -> provider info.
 * Key format: `0x${version.toString(16).padStart(8, '0')}` (lowercase).
 * Update when metric keys change (any add/remove/rename, not just provider changes).
 */
const METRICS_VERSION_MAP: Record<string, MetricsVersionInfo> = {
  // gh_commits, gh_issues, gh_prs, gh_repo_breadth, gh_reviews, x_followers, x_ship_posts, x_tweet_count
  "0x816d6ff8": { providers: ["github", "x"], metricCount: 8 },
};

export function lookupMetricsVersion(version: number): MetricsVersionInfo {
  const key = `0x${version.toString(16).padStart(8, "0")}`;
  return (
    METRICS_VERSION_MAP[key] ?? {
      providers: [],
      metricCount: 0,
    }
  );
}

/**
 * Human-readable provider category label.
 * Returns e.g. "Code activity and social metrics" or "Multiple providers".
 */
export function providerCategoryLabel(providers: string[]): string {
  if (providers.length === 0) return "Multiple providers";
  const labels: Record<string, string> = {
    github: "code activity",
    x: "social metrics",
    farcaster: "web3 social metrics",
  };
  return providers
    .map((p) => labels[p] ?? p)
    .join(" and ")
    .replace(/^./, (c) => c.toUpperCase());
}
