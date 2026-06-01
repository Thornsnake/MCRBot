import { ShieldAlert, ShieldCheck, ShieldOff } from "lucide-react";
import type { DashboardTrailingStop } from "../../api/types";
import { formatTimestamp } from "../../lib/format";

/**
 * Trailing-stop status: disabled / armed (active) / triggered, with the resume
 * time when triggered.
 */
export default function TrailingStopCard({
  ts,
}: {
  ts: DashboardTrailingStop;
}) {
  let state: { label: string; color: string; bg: string; Icon: typeof ShieldCheck };

  if (!ts.enabled) {
    state = {
      label: "Disabled",
      color: "text-text-muted",
      bg: "bg-surface-2 text-text-muted",
      Icon: ShieldOff,
    };
  } else if (ts.triggered) {
    state = {
      label: "Triggered",
      color: "text-accent-red",
      bg: "bg-accent-red/10 text-accent-red",
      Icon: ShieldAlert,
    };
  } else if (ts.active) {
    state = {
      label: "Armed",
      color: "text-accent-green",
      bg: "bg-accent-green/10 text-accent-green",
      Icon: ShieldCheck,
    };
  } else {
    state = {
      label: "Idle",
      color: "text-text-secondary",
      bg: "bg-surface-2 text-text-secondary",
      Icon: ShieldCheck,
    };
  }

  const { Icon } = state;

  return (
    <div className="rounded-lg border border-border bg-surface-1 p-4">
      <div className="flex items-start gap-3">
        <div
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${state.bg}`}
        >
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <p className="text-xs text-text-muted">Trailing Stop</p>
          <p className={`text-lg font-semibold ${state.color}`}>{state.label}</p>
          {ts.enabled && ts.triggered && ts.resume > 0 && (
            <p className="mt-0.5 text-xs text-text-muted">
              Resumes: {formatTimestamp(ts.resume)}
            </p>
          )}
          {ts.enabled && !ts.triggered && (
            <p className="mt-0.5 text-xs text-text-muted">
              {ts.active ? "Protecting profits" : "Awaiting min profit"}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
