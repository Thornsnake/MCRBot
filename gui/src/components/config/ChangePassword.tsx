import { type FormEvent, useState } from "react";
import { KeyRound } from "lucide-react";
import client, { extractApiError } from "../../api/client";
import { useAppStore } from "../../stores/appStore";
import { reconnectSocket } from "../../api/socket";
import type { AuthTokenResponse } from "../../api/types";

const inputClass =
  "rounded-md border border-border bg-surface-2 px-3 py-1.5 text-sm text-text-primary outline-none focus:ring-1 focus:ring-accent-blue";

/**
 * Change-password control. On success the backend returns a fresh token, which
 * we store so the session stays valid.
 */
export default function ChangePassword({
  onResult,
}: {
  onResult: (message: string, type: "success" | "error") => void;
}) {
  const login = useAppStore((s) => s.login);

  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();

    if (next.length < 6) {
      onResult("The new password must be at least 6 characters.", "error");
      return;
    }
    if (next !== confirm) {
      onResult("New passwords do not match.", "error");
      return;
    }

    setLoading(true);
    try {
      const { data } = await client.post<AuthTokenResponse>("/auth/change", {
        currentPassword: current,
        newPassword: next,
      });
      if (data.token) {
        login(data.token);
        // The password change invalidated every existing token server-side; re-handshake the live
        // socket with the freshly issued one so live updates survive the next reconnect.
        reconnectSocket();
      }
      onResult("Password changed successfully.", "success");
      setCurrent("");
      setNext("");
      setConfirm("");
    } catch (err) {
      onResult(extractApiError(err, "Failed to change password"), "error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="grid grid-cols-1 gap-4 sm:grid-cols-3"
    >
      <label className="flex flex-col gap-1">
        <span className="text-xs text-text-secondary">Current password</span>
        <input
          type="password"
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
          required
          className={inputClass}
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-xs text-text-secondary">New password</span>
        <input
          type="password"
          value={next}
          onChange={(e) => setNext(e.target.value)}
          required
          minLength={6}
          className={inputClass}
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-xs text-text-secondary">Confirm new password</span>
        <input
          type="password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          required
          className={inputClass}
        />
      </label>
      <div className="sm:col-span-3">
        <button
          type="submit"
          disabled={loading || !current || !next || !confirm}
          className="inline-flex items-center gap-2 rounded-md bg-surface-3 px-4 py-2 text-sm font-medium text-text-primary transition-colors hover:bg-border-light disabled:cursor-not-allowed disabled:opacity-50"
        >
          <KeyRound className="h-4 w-4" />
          {loading ? "Updating…" : "Change password"}
        </button>
      </div>
    </form>
  );
}
