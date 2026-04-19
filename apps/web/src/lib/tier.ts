export interface TierInfo {
  label: string;
  level: number;
  description: string;
  range: string;
}

export function deriveTier(score: number): TierInfo {
  if (score >= 7500) return { label: "Diamond", level: 3, description: "Top-tier builder. Sustained, high-volume contributions across multiple areas.", range: "7,500 – 10,000" };
  if (score >= 5000) return { label: "Gold", level: 2, description: "Experienced developer. Consistent contributor with significant activity.", range: "5,000 – 7,499" };
  if (score >= 2500) return { label: "Silver", level: 1, description: "Active builder. Regular contributions with growing track record.", range: "2,500 – 4,999" };
  return { label: "Bronze", level: 0, description: "Early-stage builder. Starting to build a public contribution history.", range: "0 – 2,499" };
}

export const TIER_COLORS: Record<string, string> = {
  Diamond: "text-blue-400",
  Gold: "text-amber-500",
  Silver: "text-zinc-400",
  Bronze: "text-orange-700",
};

export const TIER_BG_COLORS: Record<string, string> = {
  Diamond: "bg-blue-400/10",
  Gold: "bg-amber-500/10",
  Silver: "bg-zinc-400/10",
  Bronze: "bg-orange-700/10",
};
