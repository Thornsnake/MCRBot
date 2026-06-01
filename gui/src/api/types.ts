/**
 * Shared MCRBot domain types mirroring the Express + Socket.IO backend contract.
 */

// ---------- Core records ----------

export type TradeSide = "BUY" | "SELL";
export type TradeType = "invest" | "rebalance" | "trailingstop";

export interface Trade {
  trade_id: number;
  timestamp: number;
  coin: string;
  side: TradeSide;
  type: TradeType;
  quote_amount: number;
  base_quantity: number;
  price: number;
  quote: string;
  dry: 0 | 1;
}

/**
 * A single coin's slice of the target distribution.
 * - target: desired value in quote
 * - actual: current value in quote
 * - deviation: actual - target (positive = overweight, negative = underweight)
 * - percentage: % over/under target (positive = overweight, negative = underweight)
 */
export interface DistCoin {
  coin: string;
  target: number;
  actual: number;
  deviation: number;
  percentage: number;
}

export interface Distribution {
  timestamp: number;
  quote?: string;
  coins: DistCoin[];
}

export interface DistributionHistoryEntry {
  timestamp: number;
  deviation: number;
  percentage: number;
  actual: number;
  target: number;
}

export interface DistributionHistory {
  coin: string;
  entries: DistributionHistoryEntry[];
}

// ---------- Trailing stop ----------

export interface DashboardTrailingStop {
  enabled: boolean;
  active: boolean;
  triggered: boolean;
  resume: number;
}

export interface PortfolioTrailingStop {
  enabled: boolean;
  investment: number;
  allTimeHigh: number;
  active: boolean;
  triggered: boolean;
  resume: number;
}

// ---------- Dashboard ----------

export interface DashboardData {
  quote: string;
  dry: boolean;
  worth: number;
  availableFunds: number;
  investmentBasis: number;
  allTimeHigh: number;
  trailingStop: DashboardTrailingStop;
  removalCount: number;
  recentTrades: Trade[];
  distribution: Distribution;
}

// ---------- Trades query ----------

export interface TradesQuery {
  coin?: string;
  side?: string;
  type?: string;
  dry?: string;
  limit?: number;
  offset?: number;
}

export interface TradesResponse {
  trades: Trade[];
  total: number;
}

// ---------- Performance ----------

export interface PerformanceEntry {
  timestamp: number;
  worth: number;
  investment_basis: number;
  available_funds: number;
  all_time_high: number;
}

export interface PerformanceResponse {
  entries: PerformanceEntry[];
}

export interface PerformanceQuery {
  startTime?: number;
  endTime?: number;
}

// ---------- Portfolio ----------

export interface RemovalEntry {
  coin: string;
  execute: number;
}

export interface PortfolioState {
  quote: string;
  trailingStop: PortfolioTrailingStop;
  removalList: RemovalEntry[];
}

export interface PortfolioEvent {
  event_id: number;
  timestamp: number;
  type: string;
  coin: string | null;
  message: string | null;
}

export interface PortfolioEventsResponse {
  events: PortfolioEvent[];
}

// ---------- Config ----------

export interface DiscordPostConfig {
  INVEST: boolean;
  REBALANCE_MARKET_CAP: boolean;
  REBALANCE_OVERPERFORMERS: boolean;
  REBALANCE_UNDERPERFORMERS: boolean;
  TRAILING_STOP: boolean;
  ARMED: boolean;
  CONTINUE: boolean;
}

export interface BotConfig {
  APIKEY: string;
  SECRET: string;
  COINGECKO_API_KEY: string;
  SCHEDULE: {
    TRAILING_STOP: string;
    INVESTING: string;
    REBALANCE: string;
  };
  QUOTE: string;
  INVESTMENT: number;
  TOP: number;
  REMOVAL: number;
  INCLUDE: string[];
  EXCLUDE: string[];
  THRESHOLD: number;
  WEIGHT: { [coin: string]: number };
  TRAILING_STOP: {
    ACTIVE: boolean;
    MIN_PROFIT: number;
    MAX_DROP: number;
    RESUME: number;
  };
  IDLE_MESSAGE: string;
  WEBHOOKS: {
    DISCORD: {
      ACTIVE: boolean;
      URL: string;
      POST: DiscordPostConfig;
    };
  };
  AUTO_UPDATE: boolean;
  DRY: boolean;
  GUI: {
    ACTIVE: boolean;
    HOST: string;
    PORT: number;
    ALLOW_CONFIG: boolean;
    POLL_INTERVAL: number;
  };
  // Read-only helper flags from the snapshot.
  APIKEY_SET?: boolean;
  SECRET_SET?: boolean;
}

export interface UpdateConfigResponse {
  success: boolean;
  warnings: string[];
  config: BotConfig;
}

// ---------- Auth ----------

export interface AuthStatus {
  passwordSet: boolean;
}

export interface AuthTokenResponse {
  success: boolean;
  token: string;
}
