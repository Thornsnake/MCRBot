import { useQuery } from "@tanstack/react-query";
import client from "../client";
import { queryKeys } from "../queryKeys";
import type { Distribution, DistributionHistory } from "../types";

/**
 * The latest per-coin distribution that drives the heatmap and the
 * target-vs-actual bars.
 */
export function useDistribution() {
  return useQuery({
    queryKey: queryKeys.distribution,
    queryFn: async (): Promise<Distribution> => {
      const { data } = await client.get<Distribution>("/distribution");
      return data;
    },
  });
}

/**
 * Distribution history for a single coin (drill-down). Disabled until a coin
 * is selected.
 */
export function useDistributionHistory(coin: string | null) {
  return useQuery({
    queryKey: queryKeys.distributionCoin(coin ?? ""),
    enabled: !!coin,
    queryFn: async (): Promise<DistributionHistory> => {
      const { data } = await client.get<DistributionHistory>(
        `/distribution/${coin}`,
      );
      return data;
    },
  });
}
