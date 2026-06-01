import { useMemo } from "react";
import ReactECharts from "echarts-for-react";
import type { EChartsOption } from "echarts";
import type { DistCoin } from "../../api/types";
import { formatNumber } from "../../lib/format";

interface DistributionHeatmapProps {
  coins: DistCoin[];
  quote: string;
  /** Available cash, rendered as its own neutral tile. */
  availableFunds?: number;
  height?: number;
}

/**
 * Diverging color for a coin's deviation:
 *  - underweight (deviation < 0, room to buy)  -> green
 *  - overweight  (deviation > 0)               -> red
 *  - near target                               -> neutral grey
 * Intensity scales with |percentage|, clamped at 100%.
 */
function deviationColor(deviation: number, percentage: number): string {
  const intensity = Math.min(1, Math.abs(percentage) / 100);

  // Neutral base (surface-3) blended towards green/red.
  const neutral = [55, 65, 81]; // #374151
  const green = [34, 197, 94]; // #22c55e
  const red = [239, 68, 68]; // #ef4444

  const target = deviation < 0 ? green : red;
  const t = Math.max(0.12, intensity); // keep a hint of color even near target

  const mix = neutral.map((n, i) => Math.round(n + (target[i] - n) * t));
  return `rgb(${mix[0]}, ${mix[1]}, ${mix[2]})`;
}

interface TileDatum {
  name: string;
  value: number;
  itemStyle: { color: string };
  meta: {
    actual: number;
    target: number;
    deviation: number;
    percentage: number;
    isCash: boolean;
  };
}

export default function DistributionHeatmap({
  coins,
  quote,
  availableFunds,
  height = 420,
}: DistributionHeatmapProps) {
  const data = useMemo<TileDatum[]>(() => {
    const tiles: TileDatum[] = coins
      .filter((c) => c.actual > 0 || c.target > 0)
      .map((c) => ({
        name: c.coin,
        value: Math.max(c.actual, 0.0001),
        itemStyle: { color: deviationColor(c.deviation, c.percentage) },
        meta: {
          actual: c.actual,
          target: c.target,
          deviation: c.deviation,
          percentage: c.percentage,
          isCash: false,
        },
      }));

    if (availableFunds && availableFunds > 0) {
      tiles.push({
        name: `Cash (${quote})`,
        value: availableFunds,
        itemStyle: { color: "#1f2937" },
        meta: {
          actual: availableFunds,
          target: 0,
          deviation: 0,
          percentage: 0,
          isCash: true,
        },
      });
    }

    return tiles;
  }, [coins, availableFunds, quote]);

  const option = useMemo<EChartsOption>(() => {
    return {
      backgroundColor: "transparent",
      tooltip: {
        backgroundColor: "#1f2937",
        borderColor: "#374151",
        textStyle: { color: "#f9fafb", fontSize: 12 },
        formatter: (info: unknown) => {
          const params = info as { data?: TileDatum; name?: string };
          const d = params.data;
          if (!d) return params.name ?? "";
          const m = d.meta;
          if (m.isCash) {
            return [
              `<b>${d.name}</b>`,
              `Value: ${formatNumber(m.actual)} ${quote}`,
            ].join("<br/>");
          }
          const dir = m.deviation > 0 ? "Overweight" : "Underweight";
          const color = m.deviation > 0 ? "#ef4444" : "#22c55e";
          return [
            `<b>${d.name}</b>`,
            `Actual: ${formatNumber(m.actual)} ${quote}`,
            `Target: ${formatNumber(m.target)} ${quote}`,
            `Deviation: ${formatNumber(m.deviation)} ${quote}`,
            `<span style="color:${color}">${dir} ${formatNumber(Math.abs(m.percentage))}%</span>`,
          ].join("<br/>");
        },
      },
      series: [
        {
          type: "treemap",
          roam: false,
          nodeClick: false,
          breadcrumb: { show: false },
          width: "100%",
          height: "100%",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          itemStyle: {
            borderColor: "#0a0e17",
            borderWidth: 2,
            gapWidth: 2,
          },
          label: {
            show: true,
            color: "#f9fafb",
            fontSize: 12,
            fontWeight: 600,
            formatter: (info: unknown) => {
              const params = info as { data?: TileDatum; name?: string };
              const d = params.data;
              if (!d) return params.name ?? "";
              if (d.meta.isCash) return d.name;
              const pct = d.meta.percentage;
              const sign = pct > 0 ? "+" : "";
              return `${d.name}\n${sign}${formatNumber(pct, 1)}%`;
            },
          },
          data,
        },
      ],
    };
  }, [data, quote]);

  if (data.length === 0) {
    return (
      <div
        className="flex items-center justify-center text-sm text-text-muted"
        style={{ height }}
      >
        No distribution data yet
      </div>
    );
  }

  return (
    <ReactECharts
      option={option}
      style={{ height, width: "100%" }}
      notMerge
      opts={{ renderer: "canvas" }}
    />
  );
}
