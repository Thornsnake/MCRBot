import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Filter } from "lucide-react";
import { useTrades } from "../api/hooks/useTrades";
import type { TradesQuery } from "../api/types";
import { formatNumber, formatTimestamp } from "../lib/format";
import { DryTag, SideBadge, TypeBadge } from "../components/trades/tradeBadges";

const PAGE_SIZE = 25;

const SIDE_OPTIONS = ["", "BUY", "SELL"];
const TYPE_OPTIONS = ["", "invest", "rebalance", "trailingstop"];
const DRY_OPTIONS = [
  { label: "All", value: "" },
  { label: "Live only", value: "false" },
  { label: "Dry only", value: "true" },
];

const selectClass =
  "rounded-md border border-border bg-surface-2 px-3 py-1.5 text-sm text-text-primary outline-none focus:ring-1 focus:ring-accent-blue";

export default function TradesPage() {
  const [coin, setCoin] = useState("");
  const [side, setSide] = useState("");
  const [type, setType] = useState("");
  const [dry, setDry] = useState("");
  const [page, setPage] = useState(0);

  const params = useMemo<TradesQuery>(() => {
    const p: TradesQuery = { limit: PAGE_SIZE, offset: page * PAGE_SIZE };
    if (coin.trim()) p.coin = coin.trim().toUpperCase();
    if (side) p.side = side;
    if (type) p.type = type;
    if (dry) p.dry = dry;
    return p;
  }, [coin, side, type, dry, page]);

  const { data, isLoading, isFetching } = useTrades(params);

  const trades = data?.trades ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  function resetPageAnd(setter: (v: string) => void) {
    return (v: string) => {
      setter(v);
      setPage(0);
    };
  }

  return (
    <div className="flex flex-col gap-5 p-5">
      {/* Header */}
      <div>
        <h1 className="text-lg font-semibold text-text-primary">Trades</h1>
        <p className="text-sm text-text-muted">
          Full trade history — updates live as new trades execute
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-end gap-3 rounded-lg border border-border bg-surface-1 p-4">
        <div className="flex items-center gap-2 text-text-secondary">
          <Filter className="h-4 w-4" />
          <span className="text-xs font-medium uppercase tracking-wider">
            Filters
          </span>
        </div>

        <label className="flex flex-col gap-1">
          <span className="text-xs text-text-secondary">Coin</span>
          <input
            value={coin}
            onChange={(e) => resetPageAnd(setCoin)(e.target.value)}
            placeholder="e.g. BTC"
            className="w-28 rounded-md border border-border bg-surface-2 px-3 py-1.5 text-sm uppercase text-text-primary placeholder-text-muted outline-none focus:ring-1 focus:ring-accent-blue"
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-xs text-text-secondary">Side</span>
          <select
            value={side}
            onChange={(e) => resetPageAnd(setSide)(e.target.value)}
            className={selectClass}
          >
            {SIDE_OPTIONS.map((o) => (
              <option key={o} value={o}>
                {o || "All"}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-xs text-text-secondary">Type</span>
          <select
            value={type}
            onChange={(e) => resetPageAnd(setType)(e.target.value)}
            className={selectClass}
          >
            {TYPE_OPTIONS.map((o) => (
              <option key={o} value={o}>
                {o ? o.charAt(0).toUpperCase() + o.slice(1) : "All"}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-xs text-text-secondary">Mode</span>
          <select
            value={dry}
            onChange={(e) => resetPageAnd(setDry)(e.target.value)}
            className={selectClass}
          >
            {DRY_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>

        <span className="ml-auto text-xs text-text-muted">
          {total} trade{total === 1 ? "" : "s"}
        </span>
      </div>

      {/* Table */}
      <div className="rounded-lg border border-border bg-surface-1">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-text-secondary">
                <th className="px-4 py-2.5 font-medium">Time</th>
                <th className="px-3 py-2.5 font-medium">Coin</th>
                <th className="px-3 py-2.5 font-medium">Side</th>
                <th className="px-3 py-2.5 font-medium">Type</th>
                <th className="px-3 py-2.5 text-right font-medium">Amount</th>
                <th className="px-3 py-2.5 text-right font-medium">Quantity</th>
                <th className="px-4 py-2.5 text-right font-medium">Price</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && trades.length === 0 ? (
                <tr>
                  <td
                    colSpan={7}
                    className="px-4 py-10 text-center text-text-muted"
                  >
                    Loading trades…
                  </td>
                </tr>
              ) : trades.length === 0 ? (
                <tr>
                  <td
                    colSpan={7}
                    className="px-4 py-10 text-center text-text-muted"
                  >
                    No trades match the current filters
                  </td>
                </tr>
              ) : (
                trades.map((t, idx) => (
                  <tr
                    key={t.trade_id ?? `${t.timestamp}-${idx}`}
                    className="border-b border-border/50 transition-colors hover:bg-surface-2/60"
                  >
                    <td className="whitespace-nowrap px-4 py-2 text-text-muted">
                      {formatTimestamp(t.timestamp)}
                    </td>
                    <td className="px-3 py-2">
                      <span className="font-medium text-text-primary">
                        {t.coin}
                      </span>
                      {t.dry === 1 && (
                        <span className="ml-2">
                          <DryTag />
                        </span>
                      )}
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
                      {formatNumber(t.base_quantity, 6)}
                    </td>
                    <td className="px-4 py-2 text-right font-mono text-text-secondary">
                      {formatNumber(t.price, t.price < 1 ? 6 : 2)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="flex items-center justify-between border-t border-border px-4 py-2 text-xs text-text-secondary">
          <span>
            {total === 0
              ? "0 of 0"
              : `${page * PAGE_SIZE + 1}–${Math.min((page + 1) * PAGE_SIZE, total)} of ${total}`}
            {isFetching && <span className="ml-2 text-text-muted">updating…</span>}
          </span>
          <div className="flex items-center gap-1">
            <button
              className="rounded p-1 hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-30"
              disabled={page === 0}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              aria-label="Previous page"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="px-2">
              {page + 1} / {totalPages}
            </span>
            <button
              className="rounded p-1 hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-30"
              disabled={page >= totalPages - 1}
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              aria-label="Next page"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
