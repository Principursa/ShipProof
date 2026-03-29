import type { MetricProvider } from "./types";

const providers = new Map<string, MetricProvider>();

export function registerProvider(provider: MetricProvider) {
  providers.set(provider.id, provider);
}

export function getProvider(id: string): MetricProvider {
  const p = providers.get(id);
  if (!p) throw new Error(`Unknown provider: ${id}`);
  return p;
}

export function getAllProviders(): MetricProvider[] {
  return Array.from(providers.values());
}
