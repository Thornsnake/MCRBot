import { useQuery } from "@tanstack/react-query";
import client from "../client";
import { queryKeys } from "../queryKeys";
import type { DashboardData } from "../types";

/**
 * Dashboard overview. Live updates are wired centrally in useLiveEvents, which
 * invalidates this cache on portfolio/distribution/trade/cycle events.
 */
export function useDashboard() {
  return useQuery({
    queryKey: queryKeys.dashboard,
    queryFn: async (): Promise<DashboardData> => {
      const { data } = await client.get<DashboardData>("/dashboard");
      return data;
    },
  });
}
