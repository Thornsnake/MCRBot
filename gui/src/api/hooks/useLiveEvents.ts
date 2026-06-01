import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  getSocket,
  trackSubscription,
  untrackSubscription,
} from "../socket";
import type {
  CycleCompleteData,
  DistributionUpdateData,
  PortfolioUpdateData,
  TradeNewData,
} from "../socket";
import { queryKeys } from "../queryKeys";
import { useAppStore } from "../../stores/appStore";
import type {
  DashboardData,
  Distribution,
  Trade,
  TradeSide,
  TradeType,
} from "../types";

/**
 * Mounts once (at the AppShell level) and keeps React Query caches in sync with
 * live Socket.IO events. Subscribes to the "dashboard" room and re-subscribes
 * automatically on reconnect (handled in socket.ts). Also reflects the live
 * connection status into the app store for the header indicator.
 */
export function useLiveEvents() {
  const queryClient = useQueryClient();
  const setSocketConnected = useAppStore((s) => s.setSocketConnected);

  useEffect(() => {
    const socket = getSocket();

    socket.emit("subscribe:dashboard");
    trackSubscription("dashboard");

    // ---- connection status ----
    const onConnect = () => setSocketConnected(true);
    const onDisconnect = () => setSocketConnected(false);
    setSocketConnected(socket.connected);

    // ---- portfolio:update ----
    const onPortfolio = (data: PortfolioUpdateData) => {
      queryClient.setQueryData<DashboardData>(queryKeys.dashboard, (prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          quote: data.quote,
          worth: data.worth,
          availableFunds: data.availableFunds,
          investmentBasis: data.investmentBasis,
          allTimeHigh: data.allTimeHigh,
          trailingStop: {
            ...prev.trailingStop,
            active: data.trailingStop.active,
            triggered: data.trailingStop.triggered,
            resume: data.trailingStop.resume,
          },
        };
      });
      void queryClient.invalidateQueries({ queryKey: queryKeys.portfolio });
    };

    // ---- distribution:update ----
    const onDistribution = (data: DistributionUpdateData) => {
      const next: Distribution = {
        timestamp: data.timestamp,
        quote: data.quote,
        coins: data.distribution,
      };
      queryClient.setQueryData<Distribution>(queryKeys.distribution, next);
      queryClient.setQueryData<DashboardData>(queryKeys.dashboard, (prev) =>
        prev ? { ...prev, distribution: next } : prev,
      );
    };

    // ---- trade:new ----
    const onTrade = (data: TradeNewData) => {
      const t = data.trade;
      const normalized: Trade = {
        trade_id: -Date.now(),
        timestamp: t.timestamp,
        coin: t.coin,
        side: String(t.side).toUpperCase() as TradeSide,
        type: String(t.type).toLowerCase() as TradeType,
        quote_amount: t.quoteAmount,
        base_quantity: t.baseQuantity,
        price: t.price,
        quote: t.quote,
        dry: t.dry ? 1 : 0,
      };

      // Prepend to the dashboard's recent-trades list (cap at 10).
      queryClient.setQueryData<DashboardData>(queryKeys.dashboard, (prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          recentTrades: [normalized, ...prev.recentTrades].slice(0, 10),
        };
      });

      // Refetch the trades table so pagination/totals stay correct.
      void queryClient.invalidateQueries({ queryKey: ["trades"] });
    };

    // ---- cycle:complete ----
    const onCycle = (_data: CycleCompleteData) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.dashboard });
      void queryClient.invalidateQueries({ queryKey: queryKeys.distribution });
      void queryClient.invalidateQueries({ queryKey: queryKeys.portfolio });
      void queryClient.invalidateQueries({ queryKey: ["performance"] });
    };

    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on("portfolio:update", onPortfolio);
    socket.on("distribution:update", onDistribution);
    socket.on("trade:new", onTrade);
    socket.on("cycle:complete", onCycle);

    return () => {
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.off("portfolio:update", onPortfolio);
      socket.off("distribution:update", onDistribution);
      socket.off("trade:new", onTrade);
      socket.off("cycle:complete", onCycle);
      untrackSubscription("dashboard");
      socket.emit("unsubscribe:dashboard");
    };
  }, [queryClient, setSocketConnected]);
}
