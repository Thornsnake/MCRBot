import { useState } from "react";
import { useDistribution } from "../api/hooks/useDistribution";
import { useDashboard } from "../api/hooks/useDashboard";
import { useConfig } from "../api/hooks/useConfig";
import DistributionHeatmap from "../components/distribution/DistributionHeatmap";
import TargetActualBars from "../components/distribution/TargetActualBars";
import CoinDrilldown from "../components/distribution/CoinDrilldown";
import { formatTimestamp } from "../lib/format";

export default function DistributionPage() {
  const { data, isLoading } = useDistribution();
  const { data: dashboard } = useDashboard();
  const { data: config } = useConfig();

  const [selectedCoin, setSelectedCoin] = useState<string | null>(null);

  const coins = data?.coins ?? [];
  const quote = data?.quote ?? dashboard?.quote ?? "";
  const availableFunds = dashboard?.availableFunds;
  const threshold = config?.THRESHOLD;
  const timestamp = data?.timestamp ?? 0;

  return (
    <div className="flex flex-col gap-5 p-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-text-primary">
            Distribution
          </h1>
          <p className="text-sm text-text-muted">
            Target market-cap weighting vs current holdings
          </p>
        </div>
        {timestamp > 0 && (
          <span className="text-xs text-text-muted">
            Updated {formatTimestamp(timestamp)}
          </span>
        )}
      </div>

      {isLoading && coins.length === 0 ? (
        <div className="flex h-64 items-center justify-center text-sm text-text-muted">
          Loading distribution…
        </div>
      ) : (
        <>
          {/* Heatmap (larger) */}
          <div className="rounded-lg border border-border bg-surface-1">
            <div className="border-b border-border px-5 py-3">
              <h2 className="text-sm font-semibold text-text-primary">
                Heatmap
              </h2>
              <p className="text-xs text-text-muted">
                Green = underweight (room to buy) · Red = overweight · click a
                coin below to drill down
              </p>
            </div>
            <div className="p-4">
              <DistributionHeatmap
                coins={coins}
                quote={quote}
                availableFunds={availableFunds}
                height={520}
              />
            </div>
          </div>

          {/* Target-vs-actual bars */}
          <div className="rounded-lg border border-border bg-surface-1">
            <div className="flex items-center justify-between border-b border-border px-5 py-3">
              <div>
                <h2 className="text-sm font-semibold text-text-primary">
                  Target vs Actual
                </h2>
                <p className="text-xs text-text-muted">
                  Actual share (bar) vs target share (marker), sorted by
                  deviation
                </p>
              </div>
              {threshold != null && (
                <span className="rounded-md border border-border bg-surface-2 px-2 py-0.5 text-xs text-text-secondary">
                  Threshold: {threshold}%
                </span>
              )}
            </div>
            <div className="p-5">
              <TargetActualBars
                coins={coins}
                quote={quote}
                threshold={threshold}
              />
            </div>
          </div>

          {/* Drill-down selector */}
          <div className="rounded-lg border border-border bg-surface-1 p-5">
            <h2 className="mb-3 text-sm font-semibold text-text-primary">
              Coin Drill-down
            </h2>
            <div className="flex flex-wrap gap-2">
              {coins.map((c) => (
                <button
                  key={c.coin}
                  onClick={() =>
                    setSelectedCoin((prev) => (prev === c.coin ? null : c.coin))
                  }
                  className={`rounded-md border px-3 py-1 text-xs font-medium transition-colors ${
                    selectedCoin === c.coin
                      ? "border-accent-blue bg-accent-blue/10 text-accent-blue"
                      : "border-border bg-surface-2 text-text-secondary hover:text-text-primary"
                  }`}
                >
                  {c.coin}
                </button>
              ))}
              {coins.length === 0 && (
                <span className="text-xs text-text-muted">No coins available</span>
              )}
            </div>
          </div>

          {selectedCoin && (
            <CoinDrilldown
              coin={selectedCoin}
              quote={quote}
              onClose={() => setSelectedCoin(null)}
            />
          )}
        </>
      )}
    </div>
  );
}
