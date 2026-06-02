import { IDistributionDelta } from "./IDistributionDelta.js";
import { IPortfolioATH } from "./IPortfolioATH.js";

/**
 * A single executed (or dry-run) trade, recorded for the dashboard's trade history and emitted live.
 */
export interface ITradeRecord {
    coin: string;
    side: "BUY" | "SELL";
    type: string;            // invest | rebalance | trailingstop
    quoteAmount: number;     // notional in the quote currency
    baseQuantity: number | null;
    price: number | null;    // reference price at order time
    timestamp: number;
    dry: boolean;
}

/**
 * A snapshot of the portfolio taken at the end of a trading cycle (invest/rebalance/stop) and by the
 * dashboard's live poller. Drives the heatmap, the distribution view and the performance chart.
 */
export interface ICycleSnapshot {
    type: string;            // invest | rebalance | trailingstop | poll
    timestamp: number;
    portfolioWorth: number;
    availableFunds: number;
    distribution: IDistributionDelta[];
    trailingStop: IPortfolioATH;
}
