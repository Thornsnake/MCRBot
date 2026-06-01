import { LogOut, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import StatusDot from "../common/StatusDot";
import { useAppStore } from "../../stores/appStore";

interface HeaderProps {
  quote: string;
  dry: boolean;
}

export default function Header({ quote, dry }: HeaderProps) {
  const sidebarCollapsed = useAppStore((s) => s.sidebarCollapsed);
  const toggleSidebar = useAppStore((s) => s.toggleSidebar);
  const socketConnected = useAppStore((s) => s.socketConnected);
  const logout = useAppStore((s) => s.logout);

  return (
    <header className="flex h-12 shrink-0 items-center justify-between border-b border-border bg-surface-1 px-4">
      {/* Left – sidebar toggle */}
      <button
        onClick={toggleSidebar}
        className="rounded p-1.5 text-text-secondary transition-colors hover:bg-surface-2 hover:text-text-primary"
        aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
      >
        {sidebarCollapsed ? (
          <PanelLeftOpen className="h-5 w-5" />
        ) : (
          <PanelLeftClose className="h-5 w-5" />
        )}
      </button>

      {/* Right – quote, dry badge, connection, logout */}
      <div className="flex items-center gap-4">
        <span className="rounded-md border border-border bg-surface-2 px-2 py-0.5 text-xs font-medium text-text-secondary">
          Quote: <span className="text-text-primary">{quote || "—"}</span>
        </span>

        {dry && (
          <span className="rounded-md border border-accent-yellow/30 bg-accent-yellow/10 px-2 py-0.5 text-xs font-semibold uppercase tracking-wide text-accent-yellow">
            Dry Run
          </span>
        )}

        <StatusDot
          connected={socketConnected}
          label={socketConnected ? "Live" : "Offline"}
          pulse
        />

        <button
          onClick={logout}
          className="rounded p-1.5 text-text-secondary transition-colors hover:bg-surface-2 hover:text-text-primary"
          aria-label="Logout"
          title="Logout"
        >
          <LogOut className="h-4 w-4" />
        </button>
      </div>
    </header>
  );
}
