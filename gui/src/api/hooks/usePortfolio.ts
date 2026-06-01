import { useQuery } from "@tanstack/react-query";
import client from "../client";
import { queryKeys } from "../queryKeys";
import type { PortfolioEventsResponse, PortfolioState } from "../types";

/**
 * Trailing-stop state plus the coin removal list.
 */
export function usePortfolio() {
  return useQuery({
    queryKey: queryKeys.portfolio,
    queryFn: async (): Promise<PortfolioState> => {
      const { data } = await client.get<PortfolioState>("/portfolio");
      return data;
    },
  });
}

/**
 * Recent portfolio lifecycle events.
 */
export function usePortfolioEvents(limit = 50) {
  return useQuery({
    queryKey: queryKeys.portfolioEvents(limit),
    queryFn: async (): Promise<PortfolioEventsResponse> => {
      const { data } = await client.get<PortfolioEventsResponse>(
        "/portfolio/events",
        { params: { limit } },
      );
      return data;
    },
  });
}
