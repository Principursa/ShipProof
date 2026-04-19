export interface TierInfo {
  label: string;
  level: number;
}

export function deriveTier(score: number): TierInfo {
  if (score >= 7500) return { label: "Diamond", level: 3 };
  if (score >= 5000) return { label: "Gold", level: 2 };
  if (score >= 2500) return { label: "Silver", level: 1 };
  return { label: "Bronze", level: 0 };
}

export const TIER_COLORS: Record<string, string> = {
  Diamond: "text-blue-400",
  Gold: "text-amber-500",
  Silver: "text-zinc-400",
  Bronze: "text-orange-700",
};
