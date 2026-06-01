import { useMemo } from "react";
import type { DistCoin } from "../../api/types";
import { formatNumber } from "../../lib/format";

interface TargetActualBarsProps {
  coins: DistCoin[];
  quote: string;
  /** Deviation threshold (%) above which OVER/UNDER is flagged, if available. */
  threshold?: number;
}

interface Row {
  coin: string;
  actualPct: number;
  targetPct: number;
  deviation: number;
  percentage: number;
  flagged: boolean;
}

/**
 * Horizontal target-vs-actual bars. Each row shows the coin's actual share of the
 * portfolio as a filled bar, the target share as an overlaid marker, the
 * deviation, and an OVER/UNDER badge (over = red, under = green) gated at the
 * THRESHOLD when provided. Sorted by absolute deviation descending.
 */
export default function TargetActualBars({
  coins,
  quote,
  threshold,
}: TargetActualBarsProps) {
  const rows = useMemo<Row[]>(() => {
    const totalActual = coins.reduce((s, c) => s + Math.max(c.actual, 0), 0);
    const totalTarget = coins.reduce((s, c) => s + Math.max(c.target, 0), 0);

    return coins
      .map((c) => ({
        coin: c.coin,
        actualPct: totalActual > 0 ? (c.actual / totalActual) * 100 : 0,
        targetPct: totalTarget > 0 ? (c.target / totalTarget) * 100 : 0,
        deviation: c.deviation,
        percentage: c.percentage,
        flagged:
          threshold != null
            ? Math.abs(c.percentage) >= threshold
            : Math.abs(c.percentage) > 0,
      }))
      .sort((a, b) => Math.abs(b.deviation) - Math.abs(a.deviation));
  }, [coins, threshold]);

  const maxPct = useMemo(() => {
    const m = Math.max(
      1,
      ...rows.map((r) => Math.max(r.actualPct, r.targetPct)),
    );
    return m * 1.1; // headroom so the marker is never flush to the edge
  }, [rows]);

  if (rows.length === 0) {
    return (
      <div className="flex h-40 items-center justify-center text-sm text-text-muted">
        No distribution data yet
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2.5">
      {rows.map((r) => {
        const over = r.deviation > 0;
        const barColor = over ? "bg-accent-red/70" : "bg-accent-green/70";
        const badgeColor = over
          ? "bg-accent-red/10 text-accent-red"
          : "bg-accent-green/10 text-accent-green";
        const actualW = `${(r.actualPct / maxPct) * 100}%`;
        const targetL = `${(r.targetPct / maxPct) * 100}%`;

        return (
          <div key={r.coin} className="flex items-center gap-3">
            {/* Coin */}
            <div className="w-16 shrink-0 truncate text-sm font-medium text-text-primary">
              {r.coin}
            </div>

            {/* Bar track */}
            <div className="relative h-6 flex-1 overflow-hidden rounded bg-surface-2">
              {/* Actual fill */}
              <div
                className={`absolute inset-y-0 left-0 rounded ${barColor} transition-all`}
                style={{ width: actualW }}
              />
              {/* Target marker */}
              <div
                className="absolute inset-y-0 w-0.5 bg-text-primary"
                style={{ left: targetL }}
                title={`Target ${formatNumber(r.targetPct, 1)}%`}
              />
              {/* Inline labels */}
              <div className="absolute inset-0 flex items-center justify-between px-2 text-[11px] font-mono">
                <span className="text-text-primary/90">
                  {formatNumber(r.actualPct, 1)}%
                </span>
                <span className="text-text-secondary">
                  tgt {formatNumber(r.targetPct, 1)}%
                </span>
              </div>
            </div>

            {/* Deviation value */}
            <div
              className={`w-24 shrink-0 text-right font-mono text-xs ${
                over ? "text-accent-red" : "text-accent-green"
              }`}
            >
              {over ? "+" : ""}
              {formatNumber(r.deviation)} {quote}
            </div>

            {/* Over/Under badge */}
            <span
              className={`w-20 shrink-0 rounded-full px-2 py-0.5 text-center text-[10px] font-semibold uppercase tracking-wide ${
                r.flagged ? badgeColor : "bg-surface-2 text-text-muted"
              }`}
            >
              {over ? "Over" : "Under"} {formatNumber(Math.abs(r.percentage), 0)}%
            </span>
          </div>
        );
      })}
    </div>
  );
}
