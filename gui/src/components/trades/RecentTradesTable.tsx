import type { Trade } from "../../api/types";
import { formatNumber, timeAgo } from "../../lib/format";
import { DryTag, SideBadge, TypeBadge } from "./tradeBadges";

/**
 * Compact recent-trades table for the dashboard.
 */
export default function RecentTradesTable({ trades }: { trades: Trade[] }) {
  if (trades.length === 0) {
    return (
      <div className="px-3 py-8 text-center text-sm text-text-muted">
        No trades recorded yet
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left text-text-secondary">
            <th className="px-3 py-2 font-medium">Time</th>
            <th className="px-3 py-2 font-medium">Coin</th>
            <th className="px-3 py-2 font-medium">Side</th>
            <th className="px-3 py-2 font-medium">Type</th>
            <th className="px-3 py-2 text-right font-medium">Amount</th>
            <th className="px-3 py-2 text-right font-medium">Price</th>
          </tr>
        </thead>
        <tbody>
          {trades.map((t, idx) => (
            <tr
              key={t.trade_id ?? `${t.timestamp}-${idx}`}
              className="border-b border-border/50 transition-colors hover:bg-surface-2/60"
            >
              <td className="whitespace-nowrap px-3 py-2 text-text-muted">
                {timeAgo(t.timestamp)}
              </td>
              <td className="px-3 py-2">
                <span className="font-medium text-text-primary">{t.coin}</span>
                {t.dry === 1 && <span className="ml-2"><DryTag /></span>}
              </td>
              <td className="px-3 py-2">
                <SideBadge side={t.side} />
              </td>
              <td className="px-3 py-2">
                <TypeBadge type={t.type} />
              </td>
              <td className="px-3 py-2 text-right font-mono text-text-primary">
                {formatNumber(t.quote_amount)} {t.quote}
              </td>
              <td className="px-3 py-2 text-right font-mono text-text-secondary">
                {formatNumber(t.price, t.price < 1 ? 6 : 2)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
