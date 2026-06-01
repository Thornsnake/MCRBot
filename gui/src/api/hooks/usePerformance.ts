import { keepPreviousData, useQuery } from "@tanstack/react-query";
import client from "../client";
import { queryKeys } from "../queryKeys";
import type { PerformanceQuery, PerformanceResponse } from "../types";

/**
 * Portfolio worth / investment-basis time series with an optional time range.
 */
export function usePerformance(params: PerformanceQuery = {}) {
  return useQuery({
    queryKey: queryKeys.performance(params as Record<string, unknown>),
    queryFn: async (): Promise<PerformanceResponse> => {
      const { data } = await client.get<PerformanceResponse>("/performance", {
        params,
      });
      return data;
    },
    placeholderData: keepPreviousData,
    refetchInterval: 60_000,
  });
}
