import axios from "axios";
import { Authentication } from "./Authentication.js";
import { IInstrument } from "../interface/IInstrument.js";
import { Instrument } from "./Instrument.js";
import { CoinGecko } from "./CoinGecko.js";
import { Account } from "./Account.js";
import { Calculation } from "./Calculation.js";
import { CONFIG } from "../config.js";
import { ICoinRemoval } from "../interface/ICoinRemoval.js";
import { Database } from "./Database.js";
import { IPortfolioATH } from "../interface/IPortfolioATH.js";
import { IAccount } from "../interface/IAccount.js";
import { EMessageDataRebalanceCoinDirection, EMessageType, IMessageDataInvest, IMessageDataRebalance, WebHook } from "./WebHook.js";
import { Book } from "./Book.js";
import { IBook } from "../interface/IBook.js";
import { toPlainString } from "./Util.js";
import { ITradeRecord, ICycleSnapshot } from "../interface/IDashboard.js";
import { IDistributionDelta } from "../interface/IDistributionDelta.js";

enum ETradeType {
    INVEST = "invest",
    REBALANCE = "rebalance",
    TRAILING_STOP = "trailingstop"
}

export class Trade {
    private _authentication: Authentication;
    private _instrument: Instrument;
    private _coinGecko: CoinGecko;
    private _account: Account;
    private _book: Book;
    private _calculation: Calculation;

    // Optional dashboard listeners (set by the GUI server). When unset, the bot runs untouched.
    private _onTrade?: (record: ITradeRecord) => void;
    private _onCycle?: (snapshot: ICycleSnapshot) => void;

    // Last computed values during a cycle, stashed so a cycle snapshot can be emitted without
    // additional API calls.
    private _lastPortfolioWorth: number = 0;
    private _lastAvailableFunds: number = 0;
    private _lastDistribution: IDistributionDelta[] = [];

    constructor() {
        this._authentication = new Authentication();
        this._instrument = new Instrument();
        this._coinGecko = new CoinGecko();
        this._account = new Account();
        this._book = new Book();
        this._calculation = new Calculation;
    }

    private get Authentication() {
        return this._authentication;
    }

    public get Instrument() {
        return this._instrument;
    }

    public get Coingecko() {
        return this._coinGecko;
    }

    public get Account() {
        return this._account;
    }

    public get Book() {
        return this._book;
    }

    public get Calculation() {
        return this._calculation;
    }

    /**
     * Registers the dashboard listeners. Called by the GUI server at startup; absent when the
     * dashboard is disabled, in which case the bot behaves exactly as the headless version.
     */
    public setListeners(onTrade: (record: ITradeRecord) => void, onCycle: (snapshot: ICycleSnapshot) => void) {
        this._onTrade = onTrade;
        this._onCycle = onCycle;
    }

    private emitTrade(record: ITradeRecord) {
        try {
            this._onTrade?.(record);
        }
        catch (err) {
            console.error(err);
        }
    }

    private async emitCycle(type: string) {
        if (!this._onCycle) {
            return;
        }

        try {
            this._onCycle({
                type,
                timestamp: Date.now(),
                portfolioWorth: this._lastPortfolioWorth,
                availableFunds: this._lastAvailableFunds,
                distribution: this._lastDistribution,
                trailingStop: await this.getPortfolioATH()
            });
        }
        catch (err) {
            console.error(err);
        }
    }

    private async getCoinRemovalList(): Promise<ICoinRemoval[]> {
        const rows = Database.all(`SELECT "coin", "execute" FROM "CoinRemovalList"`) as ICoinRemoval[];
        return rows ?? [];
    }

    private async setCoinRemovalList(coinRemovalList: ICoinRemoval[]) {
        Database.transaction(() => {
            Database.execute(`DELETE FROM "CoinRemovalList"`);
            for (const entry of coinRemovalList) {
                Database.execute(
                    `INSERT INTO "CoinRemovalList" ("coin", "execute") VALUES (?, ?)
                     ON CONFLICT ("coin") DO UPDATE SET "execute" = excluded."execute"`,
                    [entry.coin, entry.execute]
                );
            }
        });
    }

    private async getPortfolioATH(): Promise<IPortfolioATH> {
        const row = Database.get(
            `SELECT "investment", "all_time_high", "active", "triggered", "resume" FROM "PortfolioATH" WHERE "id" = 1`
        ) as { investment: number; all_time_high: number; active: number; triggered: number; resume: number } | undefined;

        if (!row) {
            return {
                active: false,
                allTimeHigh: 0,
                investment: 0,
                resume: 0,
                triggered: false
            };
        }

        return {
            investment: row.investment,
            allTimeHigh: row.all_time_high,
            active: !!row.active,
            triggered: !!row.triggered,
            resume: row.resume
        };
    }

    private async setPortfolioATH(portfolioATH: IPortfolioATH) {
        Database.execute(
            `INSERT INTO "PortfolioATH" ("id", "investment", "all_time_high", "active", "triggered", "resume")
             VALUES (1, ?, ?, ?, ?, ?)
             ON CONFLICT ("id") DO UPDATE SET
                "investment" = excluded."investment",
                "all_time_high" = excluded."all_time_high",
                "active" = excluded."active",
                "triggered" = excluded."triggered",
                "resume" = excluded."resume"`,
            [
                portfolioATH.investment,
                portfolioATH.allTimeHigh,
                portfolioATH.active ? 1 : 0,
                portfolioATH.triggered ? 1 : 0,
                portfolioATH.resume
            ]
        );
    }

    private async buy(instrument: IInstrument, notional: number, minimumNotional: number, tradeType: ETradeType): Promise<boolean> {
        await new Promise(resolve => setTimeout(resolve, 100));

        if (CONFIG.DRY) {
            this.emitTrade({
                coin: instrument.base_currency.toUpperCase(),
                side: "BUY",
                type: tradeType,
                quoteAmount: notional,
                baseQuantity: null,
                price: null,
                timestamp: Date.now(),
                dry: true
            });

            return true;
        }

        // Reject non-finite or non-positive amounts outright. A malformed/illiquid order-book level
        // can otherwise yield NaN/Infinity that slips past the comparisons below (see Book.all).
        if (!Number.isFinite(notional) || notional <= 0) {
            return false;
        }

        // Sanity checks. The v1 API no longer exposes min_price/min_quantity, so the minimum order
        // value is derived from the order book by the caller (Calculation.minimumBuyNotional) and
        // passed in as minimumNotional.
        const priceTickSize = parseFloat(instrument.price_tick_size);

        if (priceTickSize > 0 && notional % priceTickSize !== 0) {
            notional = Math.floor(notional / priceTickSize) * priceTickSize;
        }

        if (notional < minimumNotional) {
            return false;
        }

        notional = parseFloat(notional.toFixed(instrument.price_decimals));

        // Buy
        try {
            const nonce = Date.now();

            const response = await axios.post(
                "https://api.crypto.com/exchange/v1/private/create-order",
                this.Authentication.sign({
                    id: nonce,
                    method: "private/create-order",
                    params: {
                        instrument_name: instrument.instrument_name,
                        side: "BUY",
                        type: "MARKET",
                        notional: toPlainString(notional),
                        client_oid: `buy-${tradeType}-${Date.now()}`
                    },
                    nonce: nonce
                }), { timeout: 30000, headers: { "Content-Type": "application/json" } });

            // The v1 API returns HTTP 200 with a JSON envelope even for business rejections
            // (insufficient balance, precision/min-notional, duplicate client_oid, ...). axios only
            // throws on network/4xx/5xx, so we must inspect the body: only code 0 is an accepted
            // order. Anything else must NOT be counted as a successful trade (issue: phantom fills).
            if (response.data?.code !== 0) {
                console.error(`[BUY] order rejected for ${instrument.instrument_name}: code=${response.data?.code} ${response.data?.message ?? ""}`);
                return false;
            }

            this.emitTrade({
                coin: instrument.base_currency.toUpperCase(),
                side: "BUY",
                type: tradeType,
                quoteAmount: notional,
                baseQuantity: null,
                price: null,
                timestamp: Date.now(),
                dry: false
            });

            return true;
        }
        catch (err) {
            console.error(err);

            return false;
        }
    }

    private async sell(instrument: IInstrument, quantity: number, tradeType: ETradeType, quoteWorth?: number) {
        await new Promise(resolve => setTimeout(resolve, 100));

        if (CONFIG.DRY) {
            this.emitTrade({
                coin: instrument.base_currency.toUpperCase(),
                side: "SELL",
                type: tradeType,
                quoteAmount: quoteWorth ?? 0,
                baseQuantity: quantity,
                price: null,
                timestamp: Date.now(),
                dry: true
            });

            return true;
        }

        // Reject non-finite or non-positive quantities outright. A malformed/illiquid order-book
        // level can otherwise yield NaN/Infinity that slips past the comparisons below (see Book.all).
        if (!Number.isFinite(quantity) || quantity <= 0) {
            return false;
        }

        // Sanity checks. min_quantity no longer exists on the v1 API; the minimum sellable quantity
        // is derived from the instrument's quantity decimals instead.
        const quantityTickSize = parseFloat(instrument.quantity_tick_size);
        const minQuantity = this.Calculation.minimumSellQuantity(instrument);

        if (quantityTickSize > 0 && quantity % quantityTickSize !== 0) {
            quantity = Math.floor(quantity / quantityTickSize) * quantityTickSize;
        }

        if (quantity < minQuantity) {
            return false;
        }

        quantity = parseFloat(quantity.toFixed(instrument.quantity_decimals));

        // Sell
        try {
            const nonce = Date.now();

            const response = await axios.post(
                "https://api.crypto.com/exchange/v1/private/create-order",
                this.Authentication.sign({
                    id: nonce,
                    method: "private/create-order",
                    params: {
                        instrument_name: instrument.instrument_name,
                        side: "SELL",
                        type: "MARKET",
                        quantity: toPlainString(quantity),
                        client_oid: `sell-${tradeType}-${Date.now()}`
                    },
                    nonce: nonce
                }), { timeout: 30000, headers: { "Content-Type": "application/json" } });

            // See buy(): a non-zero body code is a rejection even with HTTP 200. Treating it as a
            // fill would advance the bot's accounting (and, in stop(), mark the portfolio "sold")
            // while the position is still held.
            if (response.data?.code !== 0) {
                console.error(`[SELL] order rejected for ${instrument.instrument_name}: code=${response.data?.code} ${response.data?.message ?? ""}`);
                return false;
            }

            this.emitTrade({
                coin: instrument.base_currency.toUpperCase(),
                side: "SELL",
                type: tradeType,
                quoteAmount: quoteWorth ?? 0,
                baseQuantity: quantity,
                price: null,
                timestamp: Date.now(),
                dry: false
            });

            return true;
        }
        catch (err) {
            console.error(err);

            return false;
        }
    }

    /**
     * Spreads a leftover amount of quote currency evenly (weight-aware) across the buyable coins,
     * buying as much as the per-coin minimum order sizes allow. Returns the amount that could not be
     * deployed. Used as a final pass during rebalancing so proceeds are not left sitting idle.
     */
    private async reinvestSpread(instruments: IInstrument[], book: IBook[], buyableCoins: string[], amount: number, webhookData: IMessageDataRebalance): Promise<number> {
        let remaining = amount;

        if (remaining <= 0 || buyableCoins.length === 0) {
            return remaining;
        }

        const total = amount;

        for (const coin of buyableCoins) {
            if (remaining <= 0) {
                break;
            }

            const instrument = instruments.find((row) => {
                return row.base_currency.toUpperCase() === coin && row.quote_currency.toUpperCase() === CONFIG.QUOTE.toUpperCase();
            });

            if (!instrument) {
                continue;
            }

            const orderBook = book.find((row) => {
                return row.i === instrument.instrument_name;
            });

            if (!orderBook) {
                continue;
            }

            const minimumNotional = this.Calculation.fixNotional(instrument, this.Calculation.minimumBuyNotional(instrument, orderBook));

            if (minimumNotional > remaining) {
                continue;
            }

            let buyNotional = this.Calculation.fixNotional(instrument, this.Calculation.getReinvestTarget(buyableCoins, coin, total));

            if (buyNotional < minimumNotional) {
                buyNotional = minimumNotional;
            }

            if (buyNotional > remaining) {
                buyNotional = this.Calculation.fixNotional(instrument, remaining);
            }

            const bought = await this.buy(instrument, buyNotional, minimumNotional, ETradeType.REBALANCE);

            if (bought) {
                remaining -= buyNotional;

                console.log(`[BUY] ${coin} for ${buyNotional} ${CONFIG.QUOTE}`);

                webhookData.coins.push({
                    currency: coin,
                    amount: buyNotional,
                    percentage: 0,
                    direction: EMessageDataRebalanceCoinDirection.BUY
                });
            }
        }

        return remaining;
    }

    private async rebalanceMarketCaps(instruments: IInstrument[], tradableCoins: string[], tradableCoinsWithoutRemovalList: string[]) {
        let hadWorkToDo = false;

        /**
         * Get the current account balance of the user for all coins.
         */
        let balance = await this.Account.all();

        /**
         * Get the order book for all tradable coins.
         */
        const book = await this.Book.all(tradableCoins);

        /**
         * Make sure everything is present.
         */
        if (!balance || !book || balance.length === 0 || book.length === 0) {
            console.error("Account balance or order book are empty");

            return false;
        }

        /**
         * Calculate the current portfolio worth.
         */
        const portfolioWorth = this.Calculation.getPortfolioWorth(balance, tradableCoins, book);

        /**
         * If the portfolio worth is zero, there is nothing to rebalance and we can abort.
         */
        if (portfolioWorth === 0) {
            return false;
        }

        /**
         * Check if a coin has fallen out of the set market cap bound.
         */
        let shouldContinue = false;

        const coinRemovalList = await this.getCoinRemovalList();

        for (const coinBalance of balance) {
            if (coinBalance.available === 0) {
                continue;
            }

            const instrument = instruments.find((row) => {
                return row.base_currency.toUpperCase() === coinBalance.currency.toUpperCase() && row.quote_currency.toUpperCase() === CONFIG.QUOTE.toUpperCase();
            });

            if (!instrument) {
                continue;
            }

            const quantity = this.Calculation.fixQuantity(instrument, coinBalance.available);
            const minimumQuantity = this.Calculation.minimumSellQuantity(instrument);

            if (quantity < minimumQuantity) {
                continue;
            }

            if (!tradableCoinsWithoutRemovalList.includes(coinBalance.currency.toUpperCase())) {
                const coinRemoval = coinRemovalList.find((row) => {
                    return row.coin === coinBalance.currency.toUpperCase();
                });

                const excluded = CONFIG.EXCLUDE.find((row) => {
                    return row.toUpperCase() === coinBalance.currency.toUpperCase();
                });

                if (excluded) {
                    shouldContinue = true;
                }

                if (!coinRemoval) {
                    coinRemovalList.push({
                        coin: coinBalance.currency.toUpperCase(),
                        execute: Date.now() + (3600000 * CONFIG["REMOVAL"])
                    });
                }
                else if (coinRemoval.execute < Date.now()) {
                    shouldContinue = true;
                }
            }
            else {
                const index = coinRemovalList.findIndex((row) => {
                    return row.coin === coinBalance.currency.toUpperCase();
                });

                if (index > -1) {
                    coinRemovalList.splice(index, 1);
                }
            }
        }

        await this.setCoinRemovalList(coinRemovalList);

        if (!shouldContinue) {
            return false;
        }

        /**
         * Create a list of sold and bought coins for the webhook message.
         */
        const webhookData: IMessageDataRebalance = {
            portfolioWorth: portfolioWorth,
            coins: []
        }

        /**
        * If a coins has fallen out of the top x coins by market cap, sell the coin and rebalance
        * the money over the other coins.
        */
        let soldCoinWorth = 0;

        for (const coinBalance of balance) {
            if (coinBalance.available === 0) {
                continue;
            }

            const instrument = instruments.find((row) => {
                return row.base_currency.toUpperCase() === coinBalance.currency.toUpperCase() && row.quote_currency.toUpperCase() === CONFIG.QUOTE.toUpperCase();
            });

            if (!instrument) {
                continue;
            }

            const orderBook = book.find((row) => {
                return row.i === instrument.instrument_name;
            });

            if (!orderBook) {
                continue;
            }

            const quantity = this.Calculation.fixQuantity(instrument, coinBalance.available);
            const minimumQuantity = this.Calculation.minimumSellQuantity(instrument);

            if (quantity < minimumQuantity) {
                continue;
            }

            if (!tradableCoinsWithoutRemovalList.includes(coinBalance.currency.toUpperCase())) {
                const coinRemoval = coinRemovalList.find((row) => {
                    return row.coin === coinBalance.currency.toUpperCase();
                });

                const excluded = CONFIG.EXCLUDE.find((row) => {
                    return row.toUpperCase() === coinBalance.currency.toUpperCase();
                });

                if ((coinRemoval && coinRemoval.execute < Date.now()) || excluded) {
                    console.log(`[CHECK] ${coinBalance.currency.toUpperCase()} should not be in the portfolio`);
                    hadWorkToDo = true;

                    // Compute this coin's proceeds once and report THAT per-coin amount; soldCoinWorth
                    // remains the running total used for reinvestment below. (Previously the cumulative
                    // total was logged/sent per coin, so the 2nd+ coin's reported value was inflated.)
                    const coinWorth = this.Calculation.getOrderBookBidWorth(quantity, orderBook);
                    const sold = await this.sell(instrument, quantity, ETradeType.REBALANCE, coinWorth);

                    if (sold) {
                        soldCoinWorth += coinWorth;

                        const index = coinRemovalList.findIndex((row) => {
                            return row.coin === coinBalance.currency.toUpperCase();
                        });

                        coinRemovalList.splice(index, 1);

                        console.log(`[SELL] ${coinBalance.currency.toUpperCase()} for ${coinWorth} ${CONFIG.QUOTE}`);

                        webhookData.coins.push({
                            currency: coinBalance.currency.toUpperCase(),
                            amount: coinWorth,
                            percentage: 0,
                            direction: EMessageDataRebalanceCoinDirection.SELL
                        });
                    }
                }
            }
        }

        await this.setCoinRemovalList(coinRemovalList);

        /**
         * Get the available funds that are not invested.
         */
        balance = await this.Account.all();

        if (!balance || balance.length === 0) {
            console.error("Account balance is empty");

            return false;
        }

        const availableFunds = this.Calculation.getAvailableFunds(balance);

        /**
         * Make sure the re-investable worth of coins is not higher than the available funds.
         */
        if (soldCoinWorth > availableFunds) {
            soldCoinWorth = availableFunds;
        }

        /**
         * Re-invest the proceeds across the buyable coins. The total to reinvest is kept fixed so
         * each coin receives its configured WEIGHT share (issue #21 — WEIGHT was previously ignored
         * here because the proceeds were split equally). soldCoinWorth is decremented as the running
         * remainder.
         */
        const totalToReinvest = soldCoinWorth;

        for (const coin of tradableCoinsWithoutRemovalList) {
            const instrument = instruments.find((row) => {
                return row.base_currency.toUpperCase() === coin && row.quote_currency.toUpperCase() === CONFIG.QUOTE.toUpperCase();
            });

            if (!instrument) {
                continue;
            }

            const orderBook = book.find((row) => {
                return row.i === instrument.instrument_name;
            });

            if (!orderBook) {
                continue;
            }

            const minimumNotional = this.Calculation.fixNotional(instrument, this.Calculation.minimumBuyNotional(instrument, orderBook));

            // Size this coin to its weighted share of the FIXED total to reinvest, but never spend
            // more than the proceeds left. Only skip the coin when even the exchange minimum can no
            // longer be covered by the remainder. Gating directly on the shrinking remainder
            // (minimumNotional > soldCoinWorth) used to starve later weighted coins after earlier
            // ones were bumped up to their minimum (issue #21 weight fidelity).
            const reinvestTarget = this.Calculation.fixNotional(instrument, this.Calculation.getReinvestTarget(tradableCoinsWithoutRemovalList, coin, totalToReinvest));

            let buyNotional = reinvestTarget > 0 ? Math.max(reinvestTarget, minimumNotional) : 0;

            if (buyNotional > soldCoinWorth) {
                buyNotional = this.Calculation.fixNotional(instrument, soldCoinWorth);
            }

            if (buyNotional < minimumNotional) {
                continue;
            }

            const bought = await this.buy(instrument, buyNotional, minimumNotional, ETradeType.REBALANCE);

            if (bought) {
                soldCoinWorth -= buyNotional;

                console.log(`[BUY] ${coin} for ${buyNotional} ${CONFIG.QUOTE}`);

                webhookData.coins.push({
                    currency: coin,
                    amount: buyNotional,
                    percentage: 0,
                    direction: EMessageDataRebalanceCoinDirection.BUY
                });
            }
        }

        /**
         * Spread any remaining proceeds across the buyable coins so the full amount is redeployed
         * (issue #24 — idle quote currency was previously left over and later mis-counted as fresh
         * capital).
         */
        soldCoinWorth = await this.reinvestSpread(instruments, book, tradableCoinsWithoutRemovalList, soldCoinWorth, webhookData);

        if (webhookData.coins.length > 0) {
            WebHook.sendToDiscord(webhookData, EMessageType.REBALANCE_MARKET_CAP);
        }

        return hadWorkToDo;
    }

    private async rebalanceOverperformers(instruments: IInstrument[], tradableCoins: string[], buyableCoins: string[]) {
        let hadWorkToDo = false;

        /**
         * Get the current account balance of the user for all coins.
         */
        let balance = await this.Account.all();

        /**
         * Get the order book for all tradable coins.
         */
        const book = await this.Book.all(tradableCoins);

        /**
         * Make sure everything is present.
         */
        if (!balance || !book || balance.length === 0 || book.length === 0) {
            console.error("Account balance or order book are empty");

            return;
        }

        /**
         * Calculate the current portfolio worth.
         */
        const portfolioWorth = this.Calculation.getPortfolioWorth(balance, tradableCoins, book);

        /**
         * If the portfolio worth is zero, there is nothing to rebalance and we can abort.
         */
        if (portfolioWorth === 0) {
            return;
        }

        /**
         * Calculate the worth that each coin is deviating from the average.
         */
        const distributionDelta = this.Calculation.getDistributionDelta(portfolioWorth, tradableCoins, balance, book);

        // Stash the latest figures so a cycle snapshot can be emitted to the dashboard.
        this._lastPortfolioWorth = portfolioWorth;
        this._lastDistribution = distributionDelta;

        for (const coin of distributionDelta) {
            if (coin.percentage >= CONFIG.THRESHOLD) {
                console.log(`[CHECK] ${coin.name} deviates ${coin.deviation} ${CONFIG.QUOTE} (${coin.percentage.toFixed(2)}%) -> [OVERPERFORMING]`);
                hadWorkToDo = true;
            }
        }

        /**
         * Create a list of sold and bought coins for the webhook message.
         */
        const webhookData: IMessageDataRebalance = {
            portfolioWorth: portfolioWorth,
            coins: []
        }

        /**
         * Sell overperforming coins.
         */
        let soldCoinWorth = 0;

        /**
         * Coins that must never be a BUY target during reinvestment: any coin that is not in the
         * buyable universe (removal-list and excluded coins). This prevents the bot from reinvesting
         * proceeds into a coin it is trying to remove from the portfolio — which previously caused it
         * to repeatedly buy back a coin that had fallen far out of the top market caps (issues #13
         * and #23). Coins that are sold below are appended to this list as well, so they are not
         * immediately bought back.
         */
        const ignoreList: string[] = distributionDelta
            .filter((coin) => !buyableCoins.includes(coin.name))
            .map((coin) => coin.name);

        for (const tradableCoin of tradableCoins) {
            const instrument = instruments.find((row) => {
                return row.base_currency.toUpperCase() === tradableCoin && row.quote_currency.toUpperCase() === CONFIG.QUOTE.toUpperCase();
            });

            if (!instrument) {
                continue;
            }

            const orderBook = book.find((row) => {
                return row.i === instrument.instrument_name;
            });

            if (!orderBook) {
                continue;
            }

            const coin = distributionDelta.find((row) => {
                return row.name === tradableCoin;
            });

            if (coin.percentage < CONFIG.THRESHOLD) {
                continue;
            }

            const quantity = this.Calculation.fixQuantity(instrument, coin.deviation / orderBook.bids[0][0]);
            const minimumQuantity = this.Calculation.minimumSellQuantity(instrument);

            if (quantity < minimumQuantity) {
                continue;
            }

            // Reconcile the accumulated/reported proceeds with what the quantity actually realizes
            // when walked across the book. coin.deviation was a blended multi-level worth, so dividing
            // it by only the top bid undersizes the quantity slightly; accumulate and report the real
            // realized worth so soldCoinWorth and the webhook match what was sold.
            const realizedWorth = this.Calculation.getOrderBookBidWorth(quantity, orderBook);
            const sold = await this.sell(instrument, quantity, ETradeType.REBALANCE, realizedWorth);

            if (sold) {
                soldCoinWorth += realizedWorth;
                ignoreList.push(coin.name);

                console.log(`[SELL] ${tradableCoin} for ${realizedWorth} ${CONFIG.QUOTE}`);

                webhookData.coins.push({
                    currency: tradableCoin,
                    amount: realizedWorth,
                    percentage: coin.percentage,
                    direction: EMessageDataRebalanceCoinDirection.SELL
                });
            }
        }

        /**
         * Get the available funds that are not invested.
         */
        balance = await this.Account.all();

        if (!balance || balance.length === 0) {
            console.error("Account balance is empty");

            return;
        }

        const availableFunds = this.Calculation.getAvailableFunds(balance);

        /**
         * Make sure the re-investable worth of coins is not higher than the available funds.
         */
        if (soldCoinWorth > availableFunds) {
            soldCoinWorth = availableFunds;
        }

        /**
         * Re-invest into underperforming coins, bringing each one back up towards its target. Only
         * genuine underperformers (below their target) are bought in this pass, and the ignore list
         * guarantees we never buy a removal-list/excluded coin.
         */
        for (let i = 0; i < buyableCoins.length; i++) {
            const lowestPerformer = this.Calculation.getLowestPerformer(distributionDelta, ignoreList);

            /**
             * Stop once there are no more buyable underperformers. A coin at or above its target
             * (deviation >= 0) should not be bought here — doing so previously caused the bot to pour
             * the proceeds into a single coin and churn (issue #24).
             */
            if (!lowestPerformer || lowestPerformer.deviation >= 0) {
                break;
            }

            ignoreList.push(lowestPerformer.name);

            const instrument = instruments.find((row) => {
                return row.base_currency.toUpperCase() === lowestPerformer.name && row.quote_currency.toUpperCase() === CONFIG.QUOTE.toUpperCase();
            });

            if (!instrument) {
                continue;
            }

            const orderBook = book.find((row) => {
                return row.i === instrument.instrument_name;
            });

            if (!orderBook) {
                continue;
            }

            const minimumNotional = this.Calculation.fixNotional(instrument, this.Calculation.minimumBuyNotional(instrument, orderBook));

            if (minimumNotional > soldCoinWorth) {
                break;
            }

            let buyNotional = this.Calculation.fixNotional(instrument, Math.abs(lowestPerformer.deviation));

            if (buyNotional < minimumNotional) {
                buyNotional = minimumNotional;
            }

            if (buyNotional > soldCoinWorth) {
                buyNotional = this.Calculation.fixNotional(instrument, soldCoinWorth);
            }

            const bought = await this.buy(instrument, buyNotional, minimumNotional, ETradeType.REBALANCE);

            if (bought) {
                soldCoinWorth -= buyNotional;

                console.log(`[BUY] ${lowestPerformer.name} for ${buyNotional} ${CONFIG.QUOTE}`);

                webhookData.coins.push({
                    currency: lowestPerformer.name,
                    amount: lowestPerformer.deviation,
                    percentage: lowestPerformer.percentage,
                    direction: EMessageDataRebalanceCoinDirection.BUY
                });
            }
        }

        /**
         * Spread any proceeds the underperformers could not absorb evenly (weight-aware) across the
         * buyable coins, so the full sold amount is redeployed instead of being left idle as quote
         * currency that would later be mis-counted as fresh capital (issue #24).
         */
        soldCoinWorth = await this.reinvestSpread(instruments, book, buyableCoins, soldCoinWorth, webhookData);

        if (webhookData.coins.length > 0) {
            WebHook.sendToDiscord(webhookData, EMessageType.REBALANCE_OVERPERFORMERS);
        }

        return hadWorkToDo;
    }

    private async investMoney(instruments: IInstrument[], tradableCoins: string[], buyableCoins: string[]) {
        /**
         * Get the current account balance of the user for all coins.
         */
        let balance = await this.Account.all();

        /**
         * Get the order book for all tradable coins.
         */
        let book = await this.Book.all(tradableCoins);

        /**
         * Make sure everything is present.
         */
        if (!balance || !book || balance.length === 0 || book.length === 0) {
            console.error("Account balance or order book are empty");

            return;
        }

        /**
         * Get the available funds that are not invested.
         */
        let availableFunds = this.Calculation.getAvailableFunds(balance);

        /**
         * Make sure the investment worth is not higher than the available funds.
         */
        if (CONFIG.INVESTMENT > availableFunds) {
            return;
        }

        console.log("[CHECK] Investing new funds into portfolio");

        /**
         * Invest into coins. Only the buyable coins are invested into — coins that are scheduled for
         * removal (or excluded) must never be bought, even during their removal grace window (issue
         * #13: with TOP set to 0 the bot was still buying coins that were not in the manual list).
         */
        let totalInvestment = 0;

        for (const tradableCoin of buyableCoins) {
            const instrument = instruments.find((row) => {
                return row.base_currency.toUpperCase() === tradableCoin && row.quote_currency.toUpperCase() === CONFIG.QUOTE.toUpperCase();
            });

            if (!instrument) {
                continue;
            }

            const orderBook = book.find((row) => {
                return row.i === instrument.instrument_name;
            });

            if (!orderBook) {
                continue;
            }

            const minimumNotional = this.Calculation.fixNotional(instrument, this.Calculation.minimumBuyNotional(instrument, orderBook));

            const coinInvestmentTarget = this.Calculation.getCoinInvestmentTarget(buyableCoins, tradableCoin);
            let buyNotional = this.Calculation.fixNotional(instrument, coinInvestmentTarget);

            if (buyNotional < minimumNotional) {
                buyNotional = minimumNotional;
            }

            if (buyNotional > availableFunds) {
                continue;
            }

            const bought = await this.buy(instrument, buyNotional, minimumNotional, ETradeType.INVEST);

            if (bought) {
                availableFunds -= buyNotional;
                totalInvestment += buyNotional;

                console.log(`[BUY] ${tradableCoin} for ${buyNotional} ${CONFIG.QUOTE}`);
            }
        }

        /**
         * Add the investment to the trailing stop statistics. The cost basis is only increased by at
         * most CONFIG.INVESTMENT (the fresh capital the user intends to add each interval). Without
         * this cap, quote currency that was generated by rebalancing churn — not deposited by the
         * user — would be counted as new money and inflate the basis, making the trailing stop
         * progressively harder to arm (issue #24).
         */
        const portfolioATH = await this.getPortfolioATH();
        let investment = this.Calculation.cappedInvestment(portfolioATH.investment, totalInvestment);

        if (portfolioATH.investment === 0) {
            /**
             * Get the current account balance of the user for all coins.
             */
            balance = await this.Account.all();

            /**
             * Get the order book for all tradable coins.
             */
            book = await this.Book.all(tradableCoins);

            /**
             * Make sure everything is present.
             */
            if (!balance || !book || balance.length === 0 || book.length === 0) {
                console.error("Account balance or order book are empty");

                return;
            }

            /**
             * Get the current portfolio worth.
             */
            const portfolioWorth = this.Calculation.getPortfolioWorth(balance, tradableCoins, book);

            /**
             * Add the portfolio worth to the initial investment amount.
             */
            investment = portfolioWorth;
        }

        await this.setPortfolioATH({
            ...portfolioATH,
            investment: investment
        });

        /**
         * Get the current account balance of the user for all coins.
         */
        balance = await this.Account.all();

        /**
         * Get the order book for all tradable coins.
         */
        book = await this.Book.all(tradableCoins);

        /**
         * Make sure everything is present.
         */
        if (!balance || !book || balance.length === 0 || book.length === 0) {
            console.error("Account balance or order book are empty");

            return;
        }

        /**
         * Calculate the current portfolio worth.
         */
        const portfolioWorth = this.Calculation.getPortfolioWorth(balance, tradableCoins, book);

        // Stash the latest figures so a cycle snapshot can be emitted to the dashboard.
        this._lastPortfolioWorth = portfolioWorth;
        this._lastAvailableFunds = availableFunds;

        /**
         * Create information for the webhook message.
         */
        const webhookData: IMessageDataInvest = {
            investment: totalInvestment,
            remainingFunds: availableFunds,
            coinAmount: buyableCoins.length,
            portfolioWorth: portfolioWorth
        }

        WebHook.sendToDiscord(webhookData, EMessageType.INVEST);
    }

    public async rebalance() {
        /**
         * Check if the trailing stop has been triggered.
         */
        if (CONFIG.TRAILING_STOP.ACTIVE) {
            const portfolioATH = await this.getPortfolioATH();

            if (portfolioATH.triggered) {
                return;
            }
        }

        /**
         * Get all instruments that are available on crypto.com.
         */
        const instruments = await this.Instrument.all();

        /**
         * Get a list of stablecoins in the top X by market cap from Coin Gecko.
         */
        const stablecoins = await this.Coingecko.getStablecoins(false);

        /**
         * Get a list of coins in the top X by market cap from Coin Gecko.
         */
        const coins = await this.Coingecko.getCoins(false);

        /**
         * Make sure everything is present.
         */
        if (!instruments || !stablecoins || !coins) {
            return;
        }

        /**
         * Get the actual tradable coins that are both on crypto.com and Coin Gecko and are
         * not stablecoins. Exclude the removal list for the market cap check.
         */
        const tradableCoinsWithoutRemovalList = this.Calculation.getTradableCoins(instruments, stablecoins, coins);

        /**
         * Get the actual tradable coins that are both on crypto.com and Coin Gecko and are
         * not stablecoins.
         */
        let coinRemovalList = await this.getCoinRemovalList();
        let tradableCoins = this.Calculation.getTradableCoins(instruments, stablecoins, coins, coinRemovalList);

        /**
         * Rebalance
         */
        const marketCapRebalanced = await this.rebalanceMarketCaps(instruments, tradableCoins, tradableCoinsWithoutRemovalList);

        if (marketCapRebalanced) {
            /**
         * Get the actual tradable coins that are both on crypto.com and Coin Gecko and are
         * not stablecoins.
         */
            coinRemovalList = await this.getCoinRemovalList();
            tradableCoins = this.Calculation.getTradableCoins(instruments, stablecoins, coins, coinRemovalList);
        }

        /**
         * Rebalance. tradableCoinsWithoutRemovalList is the buyable universe — proceeds are only ever
         * reinvested into these coins, never into coins on the removal list.
         */
        const overperformersRebalanced = await this.rebalanceOverperformers(instruments, tradableCoins, tradableCoinsWithoutRemovalList);

        /**
         * Write that the bot had nothing to do if that is the case.
         */
        if (!marketCapRebalanced && !overperformersRebalanced) {
            if (CONFIG["IDLE_MESSAGE"]) {
                console.log(CONFIG["IDLE_MESSAGE"]);
            }
        }

        await this.emitCycle("rebalance");
    }

    public async invest() {
        /**
         * Check if the trailing stop has been triggered.
         */
        if (CONFIG.TRAILING_STOP.ACTIVE) {
            const portfolioATH = await this.getPortfolioATH();

            if (portfolioATH.triggered) {
                return;
            }
        }

        /**
         * Get all instruments that are available on crypto.com.
         */
        const instruments = await this.Instrument.all();

        /**
         * Get a list of stablecoins in the top X by market cap from Coin Gecko.
         */
        const stablecoins = await this.Coingecko.getStablecoins(false);

        /**
         * Get a list of coins in the top X by market cap from Coin Gecko.
         */
        const coins = await this.Coingecko.getCoins(false);

        /**
         * Make sure everything is present.
         */
        if (!instruments || !stablecoins || !coins) {
            return;
        }

        /**
         * Get the actual tradable coins that are both on crypto.com and Coin Gecko and are
         * not stablecoins. tradableCoins includes the removal list (used for portfolio worth);
         * buyableCoins excludes it (the coins we are actually allowed to buy into).
         */
        const coinRemovalList = await this.getCoinRemovalList();
        const tradableCoins = this.Calculation.getTradableCoins(instruments, stablecoins, coins, coinRemovalList);
        const buyableCoins = this.Calculation.getTradableCoins(instruments, stablecoins, coins);

        /**
         * Invest
         */
        await this.investMoney(instruments, tradableCoins, buyableCoins);

        await this.emitCycle("invest");
    }

    /**
     * Computes a read-only snapshot of the current portfolio (worth, available funds, per-coin
     * distribution, trailing-stop state, removal list) for the dashboard's live poller. It only
     * issues read-only API calls and never touches the trading queue, so it can run independently of
     * the trading cycles.
     */
    public async snapshot(): Promise<ICycleSnapshot | null> {
        const instruments = await this.Instrument.all();
        const stablecoins = await this.Coingecko.getStablecoins(true);
        const coins = await this.Coingecko.getCoins(true);

        if (!instruments || !stablecoins || !coins) {
            return null;
        }

        const coinRemovalList = await this.getCoinRemovalList();
        const tradableCoins = this.Calculation.getTradableCoins(instruments, stablecoins, coins, coinRemovalList);

        const balance = await this.Account.all();
        const book = await this.Book.all(tradableCoins);

        if (!balance || !book) {
            return null;
        }

        const portfolioWorth = this.Calculation.getPortfolioWorth(balance, tradableCoins, book);
        const distribution = this.Calculation.getDistributionDelta(portfolioWorth, tradableCoins, balance, book);
        const availableFunds = this.Calculation.getAvailableFunds(balance);

        this._lastPortfolioWorth = portfolioWorth;
        this._lastAvailableFunds = availableFunds;
        this._lastDistribution = distribution;

        return {
            type: "poll",
            timestamp: Date.now(),
            portfolioWorth,
            availableFunds,
            distribution,
            trailingStop: await this.getPortfolioATH()
        };
    }

    public async stop() {
        /**
         * If the trailing stop is not active, abort.
         */
        if (!CONFIG.TRAILING_STOP.ACTIVE) {
            return;
        }

        /**
         * Get the current portfolio statistics for the trailing stop.
         */
        const portfolioATH = await this.getPortfolioATH();

        if (portfolioATH.triggered) {
            if (Date.now() < portfolioATH.resume) {
                return;
            }
            else {
                console.log("Trading now resumed after trailing stop hit");
                portfolioATH.active = false;
                portfolioATH.allTimeHigh = 0;
                portfolioATH.investment = 0;
                portfolioATH.resume = 0;
                portfolioATH.triggered = false;

                /**
                 * Save the current portfolio statistics for the trailing stop.
                 */
                await this.setPortfolioATH(portfolioATH);

                /**
                 * Send a webhook message.
                 */
                WebHook.sendToDiscord(null, EMessageType.CONTINUE);
            }
        }

        /**
         * If there's no investment yet, abort.
         */
        if (portfolioATH.investment === 0) {
            return;
        }

        /**
         * Get all instruments that are available on crypto.com.
         */
        const instruments = await this.Instrument.all();

        /**
         * Get a list of stablecoins in the top X by market cap from Coin Gecko.
         */
        const stablecoins = await this.Coingecko.getStablecoins(true);

        /**
         * Get a list of coins in the top X by market cap from Coin Gecko.
         */
        const coins = await this.Coingecko.getCoins(true);

        /**
         * Make sure everything is present.
         */
        if (!instruments || !stablecoins || !coins) {
            return;
        }

        /**
         * Get the actual tradable coins that are both on crypto.com and Coin Gecko and are
         * not stablecoins.
         */
        const coinRemovalList = await this.getCoinRemovalList();
        const tradableCoins = this.Calculation.getTradableCoins(instruments, stablecoins, coins, coinRemovalList);

        /**
        * Get the current account balance of the user for all coins.
        */
        const balance = await this.Account.all();

        /**
         * Get the order book for all tradable coins.
         */
        const book = await this.Book.all(tradableCoins);

        /**
         * Make sure everything is present.
         */
        if (!balance || !book || balance.length === 0 || book.length === 0) {
            return;
        }

        /**
         * Get the current portfolio worth.
         */
        const portfolioWorth = this.Calculation.getPortfolioWorth(balance, tradableCoins, book);

        /**
         * Set the portfolio all time high.
         */
        portfolioATH.allTimeHigh = portfolioWorth > portfolioATH.allTimeHigh ? portfolioWorth : portfolioATH.allTimeHigh;

        /**
         * Check if the trailing stop should be switched to active.
         */
        const prevActive = portfolioATH.active;
        portfolioATH.active = portfolioATH.active ? portfolioATH.active : ((portfolioATH.allTimeHigh / portfolioATH.investment) - 1) * 100 >= CONFIG.TRAILING_STOP.MIN_PROFIT;

        if (portfolioATH.active) {
            /**
             * If the trailing stop was not previously active, send a message that it gas now been
             * activated.
             */
            if (!prevActive) {
                console.log("The trailing stop has been armed!");
                WebHook.sendToDiscord(null, EMessageType.ARMED);
            }

            /**
             * Check if the trailing stop should be triggered.
             */
            if (!portfolioATH.triggered) {
                /**
                 * Measure the drop relative to the all-time high (value lost FROM the ATH), matching
                 * the documented MAX_DROP semantics and the dashboard. The previous denominator
                 * (current worth) tripped early — e.g. a configured 20% fired at a real ~16.7% drop.
                 * allTimeHigh is > 0 here (investment > 0 and allTimeHigh was set to portfolioWorth).
                 */
                const dropTriggered = ((portfolioATH.allTimeHigh - portfolioWorth) / portfolioATH.allTimeHigh) * 100 >= CONFIG.TRAILING_STOP.MAX_DROP;

                if (dropTriggered) {
                    /**
                     * Sell all coins in the portfolio to the quote currency.
                     */
                    console.log("Trailing stop hit, selling portfolio");

                    let allSold = true;

                    for (const coin of balance) {
                        const instrument = instruments.find((row) => {
                            return row.base_currency.toUpperCase() === coin.currency.toUpperCase() && row.quote_currency.toUpperCase() === CONFIG.QUOTE.toUpperCase();
                        });

                        if (!instrument) {
                            continue;
                        }

                        const orderBook = book.find((row) => {
                            return row.i === instrument.instrument_name;
                        });

                        if (!orderBook) {
                            continue;
                        }

                        // If CRO is used to pay fees, we need to make sure to double-check the remaining amount before selling.
                        let croBalance: IAccount = undefined;

                        if (coin.currency.toUpperCase() === "CRO") {
                            croBalance = await this.Account.get("CRO");
                        }

                        const quantity = this.Calculation.fixQuantity(instrument, croBalance ? croBalance.available : coin.available);
                        const minimumQuantity = this.Calculation.minimumSellQuantity(instrument);

                        if (quantity < minimumQuantity) {
                            continue;
                        }

                        const sold = await this.sell(instrument, quantity, ETradeType.TRAILING_STOP, this.Calculation.getOrderBookBidWorth(quantity, orderBook));

                        if (sold) {
                            console.log(`[SELL] ${coin.currency.toUpperCase()} for ${(this.Calculation.getOrderBookBidWorth(quantity, orderBook))} ${CONFIG.QUOTE}`);
                        }
                        else {
                            allSold = false;
                        }
                    }

                    /**
                     * Only commit the triggered state and the trading pause once every position has
                     * actually been liquidated. If any sell failed (rejected order, transient error),
                     * leave triggered=false so the next trailing-stop check re-enters and re-attempts
                     * the remaining coins — instead of pausing trading for RESUME hours while still
                     * holding the very positions the stop exists to exit.
                     */
                    if (allSold) {
                        portfolioATH.triggered = true;

                        const currentDate = new Date();
                        portfolioATH.resume = currentDate.setHours(currentDate.getHours() + CONFIG.TRAILING_STOP.RESUME);

                        /**
                         * Empty the coin removal list.
                         */
                        await this.setCoinRemovalList([]);

                        console.log(`Portfolio sold, trading will resume in ${CONFIG.TRAILING_STOP.RESUME} hours`);

                        /**
                         * Send a webhook message.
                         */
                        WebHook.sendToDiscord(null, EMessageType.TRAILING_STOP);
                    }
                    else {
                        console.log("Trailing stop fired but one or more positions failed to sell; will retry on the next check");
                    }
                }
            }
        }

        /**
         * Save the current portfolio statistics for the trailing stop.
         */
        await this.setPortfolioATH(portfolioATH);
    }
}