import { useQuery } from "@tanstack/react-query";
import client from "../client";
import { queryKeys } from "../queryKeys";
import type { PortfolioState } from "../types";

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
