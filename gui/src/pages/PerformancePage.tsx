import { useEffect, useMemo, useRef, useState } from "react";
import { TrendingUp } from "lucide-react";
import {
  createChart,
  ColorType,
  LineStyle,
  LineSeries,
  type IChartApi,
  type ISeriesApi,
  type UTCTimestamp,
} from "lightweight-charts";
import { usePerformance } from "../api/hooks/usePerformance";
import { useDashboard } from "../api/hooks/useDashboard";
import { formatNumber } from "../lib/format";

const TIME_RANGES = [
  { label: "24h", ms: 24 * 60 * 60 * 1000 },
  { label: "7d", ms: 7 * 24 * 60 * 60 * 1000 },
  { label: "30d", ms: 30 * 24 * 60 * 60 * 1000 },
  { label: "All", ms: 0 },
] as const;

interface SeriesPoint {
  time: number;
  value: number;
}

/* ------------------------------------------------------------------ */
/*  Chart                                                              */
/* ------------------------------------------------------------------ */

function PerformanceChart({
  worth,
  basis,
}: {
  worth: SeriesPoint[];
  basis: SeriesPoint[];
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const worthRef = useRef<ISeriesApi<"Line"> | null>(null);
  const basisRef = useRef<ISeriesApi<"Line"> | null>(null);

  // Create chart once.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const chart = createChart(container, {
      width: container.clientWidth,
      height: 420,
      layout: {
        background: { type: ColorType.Solid, color: "#111827" },
        textColor: "#9ca3af",
        fontFamily:
          "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      },
      grid: {
        vertLines: { color: "#1f293780", style: LineStyle.Dotted },
        horzLines: { color: "#1f293780", style: LineStyle.Dotted },
      },
      crosshair: {
        vertLine: { color: "#3b82f680", width: 1, style: LineStyle.Dashed },
        horzLine: { color: "#3b82f680", width: 1, style: LineStyle.Dashed },
      },
      rightPriceScale: { borderColor: "#374151" },
      timeScale: {
        borderColor: "#374151",
        timeVisible: true,
        secondsVisible: false,
      },
    });

    const worthSeries = chart.addSeries(LineSeries, {
      color: "#22c55e",
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: true,
      title: "Worth",
    });
    const basisSeries = chart.addSeries(LineSeries, {
      color: "#3b82f6",
      lineWidth: 2,
      lineStyle: LineStyle.Dashed,
      priceLineVisible: false,
      lastValueVisible: true,
      title: "Basis",
    });

    chartRef.current = chart;
    worthRef.current = worthSeries;
    basisRef.current = basisSeries;

    const resizeObserver = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) chart.applyOptions({ width: entry.contentRect.width });
    });
    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
      chart.remove();
      chartRef.current = null;
      worthRef.current = null;
      basisRef.current = null;
    };
  }, []);

  // Update data.
  useEffect(() => {
    if (worthRef.current) {
      worthRef.current.setData(
        worth.map((d) => ({ time: d.time as UTCTimestamp, value: d.value })),
      );
    }
    if (basisRef.current) {
      basisRef.current.setData(
        basis.map((d) => ({ time: d.time as UTCTimestamp, value: d.value })),
      );
    }
    chartRef.current?.timeScale().fitContent();
  }, [worth, basis]);

  return <div ref={containerRef} className="w-full overflow-hidden rounded-lg" />;
}

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */

export default function PerformancePage() {
  const [rangeIdx, setRangeIdx] = useState(3); // default "All"
  const { data: dashboard } = useDashboard();
  const quote = dashboard?.quote ?? "";

  const params = useMemo(() => {
    const range = TIME_RANGES[rangeIdx];
    if (!range || range.ms === 0) return {};
    return { startTime: Date.now() - range.ms };
  }, [rangeIdx]);

  const { data, isLoading } = usePerformance(params);
  const entries = useMemo(
    () => [...(data?.entries ?? [])].sort((a, b) => a.timestamp - b.timestamp),
    [data],
  );

  const worth = useMemo<SeriesPoint[]>(
    () =>
      entries
        .map((e) => ({ time: Math.floor(e.timestamp / 1000), value: e.worth }))
        .filter((d) => d.time > 0 && isFinite(d.value)),
    [entries],
  );
  const basis = useMemo<SeriesPoint[]>(
    () =>
      entries
        .map((e) => ({
          time: Math.floor(e.timestamp / 1000),
          value: e.investment_basis,
        }))
        .filter((d) => d.time > 0 && isFinite(d.value)),
    [entries],
  );

  const latestWorth = entries.length ? entries[entries.length - 1].worth : 0;
  const firstWorth = entries.length ? entries[0].worth : 0;
  const change =
    firstWorth !== 0 ? ((latestWorth - firstWorth) / firstWorth) * 100 : 0;

  return (
    <div className="flex flex-col gap-5 p-5">
      <div>
        <h1 className="text-lg font-semibold text-text-primary">Performance</h1>
        <p className="text-sm text-text-muted">
          Portfolio worth over time vs investment basis
        </p>
      </div>

      <div className="rounded-lg border border-border bg-surface-1">
        {/* Top bar */}
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border px-5 py-3">
          <div className="flex items-center gap-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-accent-green/10">
              <TrendingUp className="h-5 w-5 text-accent-green" />
            </div>
            <div>
              <p className="text-xs text-text-muted">Portfolio Worth</p>
              <p className="font-mono text-lg font-semibold text-text-primary">
                {formatNumber(latestWorth)} {quote}
              </p>
            </div>
            {entries.length > 1 && (
              <span
                className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                  change >= 0
                    ? "bg-accent-green/10 text-accent-green"
                    : "bg-accent-red/10 text-accent-red"
                }`}
              >
                {change >= 0 ? "+" : ""}
                {formatNumber(change)}%
              </span>
            )}
          </div>

          {/* Legend + range buttons */}
          <div className="flex items-center gap-4">
            <div className="hidden items-center gap-3 text-xs text-text-secondary sm:flex">
              <span className="inline-flex items-center gap-1.5">
                <span className="inline-block h-0.5 w-4 bg-accent-green" /> Worth
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="inline-block h-0.5 w-4 bg-accent-blue" /> Basis
              </span>
            </div>
            <div className="flex items-center gap-1 rounded-lg bg-surface-2 p-1">
              {TIME_RANGES.map((range, idx) => (
                <button
                  key={range.label}
                  onClick={() => setRangeIdx(idx)}
                  className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                    rangeIdx === idx
                      ? "bg-accent-blue text-white"
                      : "text-text-secondary hover:bg-surface-3 hover:text-text-primary"
                  }`}
                >
                  {range.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Chart area */}
        <div className="px-4 py-4">
          {isLoading && entries.length === 0 ? (
            <div className="flex h-[420px] items-center justify-center text-sm text-text-muted">
              Loading performance data…
            </div>
          ) : entries.length === 0 ? (
            <div className="flex h-[420px] items-center justify-center text-sm text-text-muted">
              No performance data available for the selected range
            </div>
          ) : (
            <PerformanceChart worth={worth} basis={basis} />
          )}
        </div>
      </div>
    </div>
  );
}
