import { Link } from "react-router-dom";
import {
  ArrowUpRight,
  Banknote,
  Crown,
  Layers,
  Trash2,
  Wallet,
} from "lucide-react";
import { useDashboard } from "../api/hooks/useDashboard";
import StatCard from "../components/common/StatCard";
import TrailingStopCard from "../components/dashboard/TrailingStopCard";
import DistributionHeatmap from "../components/distribution/DistributionHeatmap";
import RecentTradesTable from "../components/trades/RecentTradesTable";
import { formatNumber } from "../lib/format";

function LoadingSpinner() {
  return (
    <div className="flex h-full items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-surface-3 border-t-accent-blue" />
        <p className="text-sm text-text-muted">Loading dashboard…</p>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const { data, isLoading } = useDashboard();

  if (isLoading && !data) return <LoadingSpinner />;

  const quote = data?.quote ?? "";
  const worth = data?.worth ?? 0;
  const availableFunds = data?.availableFunds ?? 0;
  const investmentBasis = data?.investmentBasis ?? 0;
  const allTimeHigh = data?.allTimeHigh ?? 0;
  const removalCount = data?.removalCount ?? 0;
  const trailingStop = data?.trailingStop ?? {
    enabled: false,
    active: false,
    triggered: false,
    resume: 0,
  };
  const recentTrades = data?.recentTrades ?? [];
  const distribution = data?.distribution ?? { timestamp: 0, coins: [] };

  const pnl = investmentBasis > 0 ? ((worth - investmentBasis) / investmentBasis) * 100 : 0;
  const fromAth = allTimeHigh > 0 ? ((worth - allTimeHigh) / allTimeHigh) * 100 : 0;

  return (
    <div className="flex flex-col gap-5 p-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-text-primary">Dashboard</h1>
          <p className="text-sm text-text-muted">
            Portfolio overview and market-cap distribution
          </p>
        </div>
      </div>

      {/* Top cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        <StatCard
          label="Portfolio Worth"
          value={`${formatNumber(worth)} ${quote}`}
          sub={
            investmentBasis > 0 ? (
              <span className={pnl >= 0 ? "text-accent-green" : "text-accent-red"}>
                {pnl >= 0 ? "+" : ""}
                {formatNumber(pnl)}% vs basis
              </span>
            ) : undefined
          }
          icon={Wallet}
          accent="blue"
        />
        <StatCard
          label="Available Funds"
          value={`${formatNumber(availableFunds)} ${quote}`}
          sub="Uninvested cash"
          icon={Banknote}
          accent="green"
        />
        <StatCard
          label="Investment Basis"
          value={`${formatNumber(investmentBasis)} ${quote}`}
          sub="Total invested"
          icon={Layers}
          accent="yellow"
        />
        <StatCard
          label="All-Time High"
          value={`${formatNumber(allTimeHigh)} ${quote}`}
          sub={
            allTimeHigh > 0 ? (
              <span className={fromAth >= 0 ? "text-accent-green" : "text-accent-red"}>
                {formatNumber(fromAth)}% from ATH
              </span>
            ) : undefined
          }
          icon={Crown}
          accent="blue"
        />
        <TrailingStopCard ts={trailingStop} />
      </div>

      {/* Heatmap centerpiece */}
      <div className="rounded-lg border border-border bg-surface-1">
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <div>
            <h2 className="text-sm font-semibold text-text-primary">
              Distribution Heatmap
            </h2>
            <p className="text-xs text-text-muted">
              Tile size = current value · color = deviation from target
            </p>
          </div>
          <Link
            to="/distribution"
            className="inline-flex items-center gap-1 text-xs font-medium text-accent-blue hover:underline"
          >
            Full view <ArrowUpRight className="h-3.5 w-3.5" />
          </Link>
        </div>
        <div className="p-4">
          <DistributionHeatmap
            coins={distribution.coins}
            quote={quote}
            availableFunds={availableFunds}
            height={420}
          />
        </div>
      </div>

      {/* Recent trades + removal count */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <div className="rounded-lg border border-border bg-surface-1 lg:col-span-2">
          <div className="flex items-center justify-between border-b border-border px-5 py-3">
            <h2 className="text-sm font-semibold text-text-primary">
              Recent Trades
            </h2>
            <Link
              to="/trades"
              className="inline-flex items-center gap-1 text-xs font-medium text-accent-blue hover:underline"
            >
              All trades <ArrowUpRight className="h-3.5 w-3.5" />
            </Link>
          </div>
          <RecentTradesTable trades={recentTrades.slice(0, 10)} />
        </div>

        <div className="rounded-lg border border-border bg-surface-1 p-5">
          <h2 className="mb-4 text-sm font-semibold text-text-primary">
            Removal List
          </h2>
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-accent-red/10">
              <Trash2 className="h-6 w-6 text-accent-red" />
            </div>
            <div>
              <p className="text-2xl font-bold font-mono text-text-primary">
                {removalCount}
              </p>
              <p className="text-xs text-text-muted">
                coin{removalCount === 1 ? "" : "s"} queued for removal
              </p>
            </div>
          </div>
          <p className="mt-4 text-xs leading-relaxed text-text-muted">
            Coins that dropped out of the target market-cap set are scheduled to
            be sold off after the configured grace period.
          </p>
        </div>
      </div>
    </div>
  );
}
