import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

type Accent = "blue" | "green" | "red" | "yellow";

const ACCENT_BG: Record<Accent, string> = {
  blue: "bg-accent-blue/10 text-accent-blue",
  green: "bg-accent-green/10 text-accent-green",
  red: "bg-accent-red/10 text-accent-red",
  yellow: "bg-accent-yellow/10 text-accent-yellow",
};

interface StatCardProps {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  icon: LucideIcon;
  accent?: Accent;
}

/**
 * A compact metric card used across the dashboard.
 */
export default function StatCard({
  label,
  value,
  sub,
  icon: Icon,
  accent = "blue",
}: StatCardProps) {
  return (
    <div className="rounded-lg border border-border bg-surface-1 p-4">
      <div className="flex items-start gap-3">
        <div
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${ACCENT_BG[accent]}`}
        >
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <p className="text-xs text-text-muted">{label}</p>
          <p className="truncate text-lg font-semibold font-mono text-text-primary">
            {value}
          </p>
          {sub != null && (
            <p className="mt-0.5 text-xs text-text-muted">{sub}</p>
          )}
        </div>
      </div>
    </div>
  );
}
