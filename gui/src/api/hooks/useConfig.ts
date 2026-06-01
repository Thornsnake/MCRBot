import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import client from "../client";
import { queryKeys } from "../queryKeys";
import type { BotConfig, UpdateConfigResponse } from "../types";

/**
 * Fetch the current bot configuration (API key masked, secret never returned).
 */
export function useConfig() {
  return useQuery({
    queryKey: queryKeys.config,
    queryFn: async (): Promise<BotConfig> => {
      const { data } = await client.get<BotConfig>("/config");
      return data;
    },
  });
}

/**
 * Update the bot configuration. Returns warnings (e.g. quote-change) on success;
 * throws the Axios error (with `{ error }` body) on 400/403/503.
 */
export function useUpdateConfig() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (
      config: Partial<BotConfig>,
    ): Promise<UpdateConfigResponse> => {
      const { data } = await client.put<UpdateConfigResponse>("/config", config);
      return data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.config });
    },
  });
}
