import { useCallback, useState } from "react";
import type { ToastMessage, ToastType } from "../components/common/Toast";

let counter = 0;

/**
 * Manages a stack of transient toast notifications.
 */
export function useToast() {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const push = useCallback((message: string, type: ToastType = "success") => {
    counter += 1;
    setToasts((prev) => [...prev, { id: counter, message, type }]);
  }, []);

  const remove = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return { toasts, push, remove };
}
