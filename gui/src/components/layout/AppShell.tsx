import { Outlet } from "react-router-dom";
import Header from "./Header";
import Sidebar from "./Sidebar";
import { useDashboard } from "../../api/hooks/useDashboard";
import { useLiveEvents } from "../../api/hooks/useLiveEvents";

/**
 * The authenticated application shell: sidebar + header + routed content.
 * Mounts the live-event listener once so every page benefits from real-time
 * cache updates, and feeds the quote/dry state into the header.
 */
export default function AppShell() {
  // Single place that wires Socket.IO into the React Query caches.
  useLiveEvents();

  const { data } = useDashboard();
  const quote = data?.quote ?? "";
  const dry = data?.dry ?? false;

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-surface-0 text-text-primary">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Header quote={quote} dry={dry} />
        <main className="flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
