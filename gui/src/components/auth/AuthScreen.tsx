import { type FormEvent, useState } from "react";
import { KeyRound, Lock, ShieldCheck } from "lucide-react";
import client, { extractApiError } from "../../api/client";
import { useAppStore } from "../../stores/appStore";
import { reconnectSocket } from "../../api/socket";
import type { AuthTokenResponse } from "../../api/types";

type Mode = "login" | "setup";

const fieldClass =
  "w-full rounded-md border border-border bg-surface-2 px-3 py-2 text-sm text-text-primary placeholder-text-muted outline-none transition-colors focus:border-accent-blue focus:ring-1 focus:ring-accent-blue";

export default function AuthScreen({
  mode,
  connectError,
}: {
  mode: Mode;
  connectError?: string | null;
}) {
  const login = useAppStore((s) => s.login);

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const isSetup = mode === "setup";

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (isSetup) {
      if (password.length < 6) {
        setError("Password must be at least 6 characters.");
        return;
      }
      if (password !== confirm) {
        setError("Passwords do not match.");
        return;
      }
    }

    setLoading(true);
    try {
      const endpoint = isSetup ? "/auth/setup" : "/auth/login";
      const { data } = await client.post<AuthTokenResponse>(endpoint, {
        password,
      });
      login(data.token);
      // Reconnect the socket so it carries the freshly issued token.
      reconnectSocket();
    } catch (err) {
      setError(
        extractApiError(err, isSetup ? "Setup failed" : "Login failed"),
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface-0 px-4">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm rounded-lg border border-border bg-surface-1 p-8"
      >
        {/* Header */}
        <div className="mb-6 flex flex-col items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-surface-2">
            {isSetup ? (
              <ShieldCheck className="h-6 w-6 text-accent-green" />
            ) : (
              <Lock className="h-6 w-6 text-accent-blue" />
            )}
          </div>
          <h1 className="text-lg font-bold text-text-primary">MCRBot</h1>
          <p className="text-center text-sm text-text-secondary">
            {isSetup
              ? "Create a password to secure your dashboard"
              : "Enter your password to continue"}
          </p>
        </div>

        {/* Password */}
        <label className="mb-4 block">
          <span className="mb-1.5 block text-xs font-medium text-text-secondary">
            {isSetup ? "New password" : "Password"}
          </span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoFocus
            minLength={isSetup ? 6 : undefined}
            className={fieldClass}
            placeholder={isSetup ? "At least 6 characters" : "Enter password"}
          />
        </label>

        {/* Confirm (setup only) */}
        {isSetup && (
          <label className="mb-4 block">
            <span className="mb-1.5 block text-xs font-medium text-text-secondary">
              Confirm password
            </span>
            <input
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
              className={fieldClass}
              placeholder="Re-enter password"
            />
          </label>
        )}

        {/* Errors */}
        {(error || connectError) && (
          <p className="mb-4 rounded-md bg-accent-red/10 px-3 py-2 text-xs text-accent-red">
            {error ?? connectError}
          </p>
        )}

        {/* Submit */}
        <button
          type="submit"
          disabled={loading || !password || (isSetup && !confirm)}
          className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-accent-blue px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-blue/90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <KeyRound className="h-4 w-4" />
          {loading
            ? isSetup
              ? "Setting up…"
              : "Logging in…"
            : isSetup
              ? "Set password & continue"
              : "Login"}
        </button>
      </form>
    </div>
  );
}
