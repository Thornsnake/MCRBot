import { useEffect } from "react";
import { AlertCircle, AlertTriangle, CheckCircle, X } from "lucide-react";

export type ToastType = "success" | "error" | "warning";

export interface ToastMessage {
  id: number;
  message: string;
  type: ToastType;
}

const STYLES: Record<ToastType, string> = {
  success: "border-accent-green/30 bg-accent-green/10 text-accent-green",
  error: "border-accent-red/30 bg-accent-red/10 text-accent-red",
  warning: "border-accent-yellow/30 bg-accent-yellow/10 text-accent-yellow",
};

function ToastIcon({ type }: { type: ToastType }) {
  if (type === "success") return <CheckCircle className="h-4 w-4 shrink-0" />;
  if (type === "warning") return <AlertTriangle className="h-4 w-4 shrink-0" />;
  return <AlertCircle className="h-4 w-4 shrink-0" />;
}

function ToastItem({
  toast,
  onClose,
}: {
  toast: ToastMessage;
  onClose: (id: number) => void;
}) {
  useEffect(() => {
    const timer = setTimeout(() => onClose(toast.id), 5000);
    return () => clearTimeout(timer);
  }, [toast.id, onClose]);

  return (
    <div
      className={`flex items-start gap-2 rounded-lg border px-4 py-3 text-sm shadow-lg ${STYLES[toast.type]}`}
    >
      <ToastIcon type={toast.type} />
      <span className="flex-1 leading-snug">{toast.message}</span>
      <button
        onClick={() => onClose(toast.id)}
        className="shrink-0 opacity-70 transition-opacity hover:opacity-100"
        aria-label="Dismiss"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

/**
 * Stacked toast container. Render once near the page root with a list of
 * messages and a remove handler.
 */
export function ToastStack({
  toasts,
  onClose,
}: {
  toasts: ToastMessage[];
  onClose: (id: number) => void;
}) {
  if (toasts.length === 0) return null;
  return (
    <div className="fixed bottom-5 right-5 z-50 flex w-80 flex-col gap-2">
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} onClose={onClose} />
      ))}
    </div>
  );
}
