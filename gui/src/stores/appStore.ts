import { create } from "zustand";
import { TOKEN_KEY } from "../api/client";
import { disconnectSocket } from "../api/socket";

// ---------- Types ----------

interface AppState {
  /** Whether the sidebar navigation is collapsed */
  sidebarCollapsed: boolean;
  /** Whether the user is currently authenticated */
  isAuthenticated: boolean;
  /** The auth token, or null if not logged in */
  token: string | null;
  /** Live socket connection status, surfaced in the header */
  socketConnected: boolean;

  // ---------- Actions ----------

  toggleSidebar: () => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
  setSocketConnected: (connected: boolean) => void;
  login: (token: string) => void;
  logout: () => void;
}

// ---------- Store ----------

/**
 * Global application state. Auth is hydrated from localStorage so the session
 * survives reloads.
 */
export const useAppStore = create<AppState>((set) => {
  const persistedToken = localStorage.getItem(TOKEN_KEY);

  return {
    sidebarCollapsed: false,
    isAuthenticated: !!persistedToken,
    token: persistedToken,
    socketConnected: false,

    toggleSidebar: () =>
      set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),

    setSidebarCollapsed: (collapsed) => set({ sidebarCollapsed: collapsed }),

    setSocketConnected: (connected) => set({ socketConnected: connected }),

    login: (token) => {
      localStorage.setItem(TOKEN_KEY, token);
      set({ isAuthenticated: true, token });
    },

    logout: () => {
      localStorage.removeItem(TOKEN_KEY);
      disconnectSocket();
      set({ isAuthenticated: false, token: null, socketConnected: false });
    },
  };
});

// Listen for forced logout events dispatched by the Axios 401 interceptor.
window.addEventListener("auth:logout", () => {
  useAppStore.getState().logout();
});
