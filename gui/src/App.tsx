import { Navigate, Route, Routes } from "react-router-dom";
import AuthGate from "./components/auth/AuthGate";
import AppShell from "./components/layout/AppShell";
import DashboardPage from "./pages/DashboardPage";
import DistributionPage from "./pages/DistributionPage";
import TradesPage from "./pages/TradesPage";
import PerformancePage from "./pages/PerformancePage";
import SettingsPage from "./pages/SettingsPage";

export default function App() {
  return (
    <AuthGate>
      <Routes>
        <Route element={<AppShell />}>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/distribution" element={<DistributionPage />} />
          <Route path="/trades" element={<TradesPage />} />
          <Route path="/performance" element={<PerformancePage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </AuthGate>
  );
}
