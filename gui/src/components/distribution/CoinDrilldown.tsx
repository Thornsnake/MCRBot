import { X } from "lucide-react";
import { useDistributionHistory } from "../../api/hooks/useDistribution";
import { formatNumber, formatTimestamp } from "../../lib/format";

/**
 * Drill-down panel for a single coin: its deviation/percentage history pulled
 * from /distribution/:coin.
 */
export default function CoinDrilldown({
  coin,
  quote,
  onClose,
}: {
  coin: string;
  quote: string;
  onClose: () => void;
}) {
  const { data, isLoading } = useDistributionHistory(coin);
  const entries = [...(data?.entries ?? [])].reverse(); // newest first

  return (
    <div className="rounded-lg border border-border bg-surface-1">
      <div className="flex items-center justify-between border-b border-border px-5 py-3">
        <h2 className="text-sm font-semibold text-text-primary">
          {coin} · Distribution History
        </h2>
        <button
          onClick={onClose}
          className="rounded p-1 text-text-secondary transition-colors hover:bg-surface-2 hover:text-text-primary"
          aria-label="Close drill-down"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {isLoading ? (
        <div className="px-5 py-8 text-center text-sm text-text-muted">
          Loading history…
        </div>
      ) : entries.length === 0 ? (
        <div className="px-5 py-8 text-center text-sm text-text-muted">
          No history recorded for {coin}.
        </div>
      ) : (
        <div className="max-h-80 overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-surface-1">
              <tr className="border-b border-border text-left text-text-secondary">
                <th className="px-5 py-2 font-medium">Time</th>
                <th className="px-3 py-2 text-right font-medium">Actual</th>
                <th className="px-3 py-2 text-right font-medium">Target</th>
                <th className="px-3 py-2 text-right font-medium">Deviation</th>
                <th className="px-5 py-2 text-right font-medium">%</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e, idx) => (
                <tr
                  key={`${e.timestamp}-${idx}`}
                  className="border-b border-border/50"
                >
                  <td className="whitespace-nowrap px-5 py-2 text-text-muted">
                    {formatTimestamp(e.timestamp)}
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-text-primary">
                    {formatNumber(e.actual)} {quote}
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-text-secondary">
                    {formatNumber(e.target)} {quote}
                  </td>
                  <td
                    className={`px-3 py-2 text-right font-mono ${
                      e.deviation > 0 ? "text-accent-red" : "text-accent-green"
                    }`}
                  >
                    {e.deviation > 0 ? "+" : ""}
                    {formatNumber(e.deviation)}
                  </td>
                  <td
                    className={`px-5 py-2 text-right font-mono ${
                      e.percentage > 0 ? "text-accent-red" : "text-accent-green"
                    }`}
                  >
                    {e.percentage > 0 ? "+" : ""}
                    {formatNumber(e.percentage, 1)}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
