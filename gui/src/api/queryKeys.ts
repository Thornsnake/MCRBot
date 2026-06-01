/**
 * Centralised React Query keys so hooks and the live-event layer agree on the
 * caches to read and invalidate.
 */
export const queryKeys = {
  dashboard: ["dashboard"] as const,
  distribution: ["distribution"] as const,
  distributionCoin: (coin: string) => ["distribution", "coin", coin] as const,
  trades: (params: Record<string, unknown>) => ["trades", params] as const,
  performance: (params: Record<string, unknown>) =>
    ["performance", params] as const,
  portfolio: ["portfolio"] as const,
  portfolioEvents: (limit: number) => ["portfolio", "events", limit] as const,
  config: ["config"] as const,
};
