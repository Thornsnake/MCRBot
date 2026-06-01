import {
  LayoutDashboard,
  PieChart,
  Settings,
  TrendingUp,
  ArrowLeftRight,
} from "lucide-react";
import { NavLink } from "react-router-dom";
import { useAppStore } from "../../stores/appStore";
import StatusDot from "../common/StatusDot";

const baseLinkClasses =
  "flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors";

function linkClasses({ isActive }: { isActive: boolean }): string {
  return `${baseLinkClasses} ${
    isActive
      ? "bg-surface-2 text-text-primary border-l-2 border-accent-blue -ml-px"
      : "text-text-secondary hover:bg-surface-2/60 hover:text-text-primary"
  }`;
}

const NAV = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, end: true },
  { to: "/distribution", label: "Distribution", icon: PieChart, end: false },
  { to: "/trades", label: "Trades", icon: ArrowLeftRight, end: false },
  { to: "/performance", label: "Performance", icon: TrendingUp, end: false },
  { to: "/settings", label: "Settings", icon: Settings, end: false },
] as const;

export default function Sidebar() {
  const collapsed = useAppStore((s) => s.sidebarCollapsed);
  const socketConnected = useAppStore((s) => s.socketConnected);

  return (
    <aside
      className={`flex shrink-0 flex-col overflow-y-auto overflow-x-hidden border-r border-border bg-surface-1 transition-[width] duration-200 ${
        collapsed ? "w-16" : "w-60"
      }`}
    >
      {/* Brand */}
      <div className="flex h-12 shrink-0 items-center gap-2.5 border-b border-border px-4">
        <StatusDot connected={socketConnected} size="md" />
        {!collapsed && (
          <span className="whitespace-nowrap text-sm font-bold tracking-wide text-text-primary">
            MCRBot
          </span>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex flex-1 flex-col gap-0.5 px-2 py-2">
        {NAV.map(({ to, label, icon: Icon, end }) => (
          <NavLink key={to} to={to} end={end} className={linkClasses}>
            <Icon className="h-4 w-4 shrink-0" />
            {!collapsed && <span>{label}</span>}
          </NavLink>
        ))}
      </nav>

      {!collapsed && (
        <div className="border-t border-border px-4 py-3 text-[10px] uppercase tracking-wider text-text-muted">
          Market-cap rebalancing
        </div>
      )}
    </aside>
  );
}
