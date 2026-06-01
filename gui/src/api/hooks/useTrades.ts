import { keepPreviousData, useQuery } from "@tanstack/react-query";
import client from "../client";
import { queryKeys } from "../queryKeys";
import type { TradesQuery, TradesResponse } from "../types";

/**
 * Paginated, filterable trade history.
 */
export function useTrades(params: TradesQuery = {}) {
  return useQuery({
    queryKey: queryKeys.trades(params as Record<string, unknown>),
    queryFn: async (): Promise<TradesResponse> => {
      const { data } = await client.get<TradesResponse>("/trades", { params });
      return data;
    },
    placeholderData: keepPreviousData,
  });
}
