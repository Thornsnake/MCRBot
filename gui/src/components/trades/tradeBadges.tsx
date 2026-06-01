import type { TradeSide, TradeType } from "../../api/types";

const TYPE_LABEL: Record<TradeType, string> = {
  invest: "Invest",
  rebalance: "Rebalance",
  trailingstop: "Trailing Stop",
};

const TYPE_STYLE: Record<TradeType, string> = {
  invest: "bg-accent-blue/10 text-accent-blue",
  rebalance: "bg-surface-2 text-text-secondary",
  trailingstop: "bg-accent-yellow/10 text-accent-yellow",
};

export function SideBadge({ side }: { side: TradeSide }) {
  const buy = side === "BUY";
  return (
    <span
      className={`inline-block rounded px-1.5 py-0.5 text-xs font-semibold ${
        buy ? "text-accent-green" : "text-accent-red"
      }`}
    >
      {side}
    </span>
  );
}

export function TypeBadge({ type }: { type: TradeType }) {
  return (
    <span
      className={`inline-block rounded px-2 py-0.5 text-[11px] font-medium ${
        TYPE_STYLE[type] ?? "bg-surface-2 text-text-secondary"
      }`}
    >
      {TYPE_LABEL[type] ?? type}
    </span>
  );
}

export function DryTag() {
  return (
    <span className="inline-block rounded border border-accent-yellow/30 bg-accent-yellow/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-accent-yellow">
      Dry
    </span>
  );
}
