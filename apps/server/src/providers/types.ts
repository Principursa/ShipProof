/** A single numeric metric produced by a provider. */
export interface RawMetric {
  /** Stable key, e.g. "gh_commits", "x_followers". */
  key: string;
  /** Human-readable label for UI. */
  label: string;
  /** Raw integer value (pre-encryption). */
  value: number;
  /** Normalization cap for this metric. */
  cap: number;
  /** Basis-point weight for this metric in the overall score. */
  weight: number;
}

/** Result of a provider fetching metrics for a user. */
export interface ProviderResult {
  /** Provider identifier, e.g. "github", "x". */
  providerId: string;
  /** Provider-specific user ID (used in identity hash). */
  userId: string;
  /** The metrics this provider produced. */
  metrics: RawMetric[];
}

/** OAuth tokens obtained from a provider. */
export interface ProviderTokens {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: number;
}

/** Every data source implements this interface. */
export interface MetricProvider {
  /** Unique provider ID. Must be stable across versions. */
  readonly id: string;
  /** Human-readable name for UI display. */
  readonly displayName: string;
  /** OAuth scopes this provider needs. */
  readonly requiredScopes: string[];

  /** Generate the OAuth authorization URL. */
  getAuthUrl(state: string, redirectUri: string): string;
  /** Exchange OAuth callback code for tokens. */
  exchangeCode(code: string, redirectUri: string): Promise<ProviderTokens>;
  /** Fetch the authenticated user's provider-specific ID. */
  getUserId(tokens: ProviderTokens): Promise<string>;
  /** Fetch metrics for the given user over the time window. */
  fetchMetrics(
    tokens: ProviderTokens,
    userId: string,
    window: { from: Date; to: Date },
  ): Promise<ProviderResult>;
}
