import { io, type Socket } from "socket.io-client";
import { TOKEN_KEY } from "./client";
import type { DistCoin } from "./types";

// ---------- Types for server-to-client events ----------

export interface PortfolioUpdateData {
  timestamp: number;
  worth: number;
  availableFunds: number;
  investmentBasis: number;
  allTimeHigh: number;
  trailingStop: {
    active: boolean;
    triggered: boolean;
    resume: number;
  };
  quote: string;
}

export interface DistributionUpdateData {
  timestamp: number;
  quote: string;
  distribution: DistCoin[];
}

export interface TradeNewData {
  trade: {
    coin: string;
    side: string;
    type: string;
    quoteAmount: number;
    baseQuantity: number;
    price: number;
    timestamp: number;
    dry: boolean;
    quote: string;
  };
}

export interface CycleCompleteData {
  type: string;
  timestamp: number;
}

// ---------- Event maps ----------

interface ServerToClientEvents {
  "portfolio:update": (data: PortfolioUpdateData) => void;
  "distribution:update": (data: DistributionUpdateData) => void;
  "trade:new": (data: TradeNewData) => void;
  "cycle:complete": (data: CycleCompleteData) => void;
}

interface ClientToServerEvents {
  "subscribe:dashboard": () => void;
  "unsubscribe:dashboard": () => void;
}

export type McrSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

// ---------- Singleton socket ----------

let socket: McrSocket | null = null;

/**
 * Active subscriptions re-emitted after reconnection. Currently only "dashboard".
 */
const activeSubscriptions = new Set<string>();

export function trackSubscription(key: string): void {
  activeSubscriptions.add(key);
}

export function untrackSubscription(key: string): void {
  activeSubscriptions.delete(key);
}

/**
 * Returns the shared Socket.IO client. Creates a connection on first call,
 * reading the auth token from localStorage. Reconnects with exponential backoff
 * and re-emits tracked subscriptions on every (re)connect.
 */
export function getSocket(): McrSocket {
  if (socket) return socket;

  const token = localStorage.getItem(TOKEN_KEY);

  socket = io("/", {
    auth: { token: token ?? "" },
    transports: ["websocket", "polling"],
    autoConnect: true,
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 10000,
  });

  socket.on("connect", () => {
    // Re-emit all tracked subscriptions after (re)connection.
    for (const key of activeSubscriptions) {
      if (key === "dashboard") {
        socket?.emit("subscribe:dashboard");
      }
    }
  });

  socket.on("connect_error", (err) => {
    console.error("[socket] connection error:", err.message);
  });

  return socket;
}

/**
 * Disconnect and dispose of the socket (e.g. on logout) so a fresh connection
 * with a new token can be created.
 */
export function disconnectSocket(): void {
  if (socket) {
    socket.removeAllListeners();
    socket.disconnect();
    socket = null;
  }
}

/**
 * Reconnect with the current token from localStorage (after login).
 */
export function reconnectSocket(): McrSocket {
  disconnectSocket();
  return getSocket();
}
