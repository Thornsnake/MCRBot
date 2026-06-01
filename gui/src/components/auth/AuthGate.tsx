import { useEffect, useState } from "react";
import client from "../../api/client";
import { useAppStore } from "../../stores/appStore";
import type { AuthStatus } from "../../api/types";
import AuthScreen from "./AuthScreen";

/**
 * Wraps the whole app. On mount it checks whether a password has been set and
 * renders either the auth screen (set-password / login) or the children once a
 * valid token is present.
 */
export default function AuthGate({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useAppStore((s) => s.isAuthenticated);

  const [passwordSet, setPasswordSet] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function check() {
      try {
        const { data } = await client.get<AuthStatus>("/auth/status");
        if (!cancelled) {
          setPasswordSet(data.passwordSet);
          setError(null);
        }
      } catch {
        if (!cancelled) setError("Unable to reach the MCRBot server.");
      }
    }

    void check();
    return () => {
      cancelled = true;
    };
  }, []);

  // Already authenticated with a stored token → straight into the app.
  if (isAuthenticated) {
    return <>{children}</>;
  }

  // Still resolving auth status.
  if (passwordSet === null && !error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface-0">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-surface-3 border-t-accent-blue" />
          <p className="text-sm text-text-muted">Connecting…</p>
        </div>
      </div>
    );
  }

  return (
    <AuthScreen
      mode={passwordSet ? "login" : "setup"}
      connectError={error}
    />
  );
}
