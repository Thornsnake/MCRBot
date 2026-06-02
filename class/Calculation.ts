import { CONFIG } from "../config.js";
import { IAccount } from "../interface/IAccount.js";
import { IBook } from "../interface/IBook.js";
import { ICoinRemoval } from "../interface/ICoinRemoval.js";
import { IDistributionDelta } from "../interface/IDistributionDelta.js";
import { IInstrument } from "../interface/IInstrument.js";

export class Calculation {
    constructor() { }

    public getOrderBookBidWorth(coinAmmount: number, book: IBook) {
        let currencyWorth = 0;
        let currencyAmount = coinAmmount;

        for (const bid of book.bids) {
            const price = bid[0];
            const quantity = bid[1];

            // Defence in depth: ignore any malformed level so a stray NaN cannot poison the
            // accumulator and the `currencyAmount <= 0` break (Book.all already sanitizes levels).
            if (!Number.isFinite(price) || !Number.isFinite(quantity)) {
                continue;
            }

            if (quantity <= currencyAmount) {
                currencyWorth += quantity * price;
            }
            else {
                currencyWorth += currencyAmount * price;
            }

            currencyAmount -= quantity;

            if (currencyAmount <= 0) {
                break;
            }
        }

        return currencyWorth;
    }

    public getTradableCoins(instruments: IInstrument[], stablecoins: string[], coins: string[], coinRemovalList?: ICoinRemoval[]) {
        const tradableCoins: string[] = [];

        for (const instrument of instruments) {
            if (instrument.quote_currency.toUpperCase() !== CONFIG.QUOTE.toUpperCase()) {
                continue;
            }

            if (CONFIG.EXCLUDE.includes(instrument.base_currency.toUpperCase())) {
                continue;
            }

            const stablecoin = stablecoins.find((row) => {
                return row === instrument.base_currency.toUpperCase();
            });

            if (stablecoin) {
                continue;
            }

            const coin = coins.find((row) => {
                return row === instrument.base_currency.toUpperCase();
            });

            if (coin) {
                tradableCoins.push(coin);
            }
        }

        for (const coin of CONFIG.INCLUDE) {
            const tradableCoin = tradableCoins.find((row) => {
                return row === coin;
            });

            if (!tradableCoin) {
                const instrument = instruments.find((row) => {
                    return row.base_currency.toUpperCase() === coin && row.quote_currency.toUpperCase() === CONFIG.QUOTE.toUpperCase();
                });

                if (instrument) {
                    tradableCoins.push(coin);
                }
            }
        }

        if (coinRemovalList) {
            for (const coinRemoval of coinRemovalList) {
                if (coinRemoval.coin === CONFIG.QUOTE.toUpperCase()) {
                    continue;
                }

                const tradableCoin = tradableCoins.find((row) => {
                    return row === coinRemoval.coin;
                });

                if (!tradableCoin) {
                    tradableCoins.push(coinRemoval.coin);
                }
            }
        }

        return tradableCoins;
    }

    public getPortfolioWorth(balance: IAccount[], tradableCoins: string[], book: IBook[]) {
        let portfolioWorth = 0;

        for (const tradableCoin of tradableCoins) {
            const coin = balance.find((row) => {
                return row.currency.toUpperCase() === tradableCoin;
            });

            if (!coin) {
                continue;
            }

            const orderBook = book.find((row) => {
                return row.i === `${coin.currency}_${CONFIG.QUOTE}`;
            });

            if (!orderBook) {
                continue;
            }

            portfolioWorth += this.getOrderBookBidWorth(coin.available, orderBook);
        }

        return portfolioWorth;
    }

    public getDistributionDelta(portfolioWorth: number, tradableCoins: string[], balance: IAccount[], book: IBook[]) {
        const deviations: IDistributionDelta[] = [];

        for (const tradableCoin of tradableCoins) {
            let coin = balance.find((row) => {
                return row.currency.toUpperCase() === tradableCoin;
            });

            if (!coin) {
                coin = {
                    currency: tradableCoin,
                    balance: 0,
                    available: 0,
                    order: 0,
                    stake: 0
                };
            }

            const orderBook = book.find((row) => {
                return row.i.split("_")[0].toUpperCase() === coin.currency.toUpperCase() && row.i.split("_")[1].toUpperCase() === CONFIG.QUOTE.toUpperCase();
            });

            if (!orderBook) {
                continue;
            }

            const coinTarget = this.weightedTarget(tradableCoins, tradableCoin, portfolioWorth);
            const deviation = (this.getOrderBookBidWorth(coin.available, orderBook)) - coinTarget;

            const percentageDelta = coinTarget === 0 ? 0 : (((deviation + coinTarget) / coinTarget) - 1) * 100;

            deviations.push({
                name: tradableCoin,
                deviation: deviation,
                percentage: percentageDelta,
                target: coinTarget
            });
        }

        return deviations;
    }

    public getAvailableFunds(balance: IAccount[]) {
        const funds = balance.find((row) => {
            return row.currency.toUpperCase() === CONFIG.QUOTE.toUpperCase();
        });

        if (!funds) {
            return 0;
        }

        return funds.available;
    }

    public getLowestPerformer(distributionDelta: IDistributionDelta[], ignoreList: string[]) {
        let lowestPerformer: IDistributionDelta = null;

        for (const coin of distributionDelta) {
            if (ignoreList.includes(coin.name)) {
                continue;
            }

            if (!lowestPerformer) {
                lowestPerformer = coin;
                continue;
            }

            if (coin.percentage < lowestPerformer.percentage) {
                lowestPerformer = coin;
            }
        }

        return lowestPerformer;
    }

    public fixNotional(instrument: IInstrument, notional: number) {
        // Nudge by a tiny epsilon (far below any real tick) before flooring so values whose scaled
        // product lands just under an integer in binary floating point (e.g. 0.29*100 = 28.9999…)
        // are not floored a whole tick too low.
        const factor = Math.pow(10, instrument.price_decimals);
        return Math.floor(notional * factor + 1e-9) / factor;
    }

    public fixQuantity(instrument: IInstrument, quantity: number) {
        const factor = Math.pow(10, instrument.quantity_decimals);
        return Math.floor(quantity * factor + 1e-9) / factor;
    }

    public minimumBuyNotional(instrument: IInstrument, book: IBook) {
        const minPriceNotional = (1 / Math.pow(10, instrument.price_decimals)) * 1.1;

        // Guard against a missing/empty asks side (Book.all already drops such books, but this keeps
        // the function safe for any caller). Fall back to the price-only minimum.
        if (!book.asks || book.asks.length === 0 || !Number.isFinite(book.asks[0]?.[0])) {
            return minPriceNotional;
        }

        const minQuantityNotional = (book.asks[0][0] / Math.pow(10, instrument.quantity_decimals)) * 1.1;

        return minPriceNotional > minQuantityNotional ? minPriceNotional : minQuantityNotional;
    }

    public minimumSellQuantity(instrument: IInstrument) {
        return (1 / Math.pow(10, instrument.quantity_decimals));
    }

    /**
     * Case-insensitive lookup of a coin's configured WEIGHT (in percent), or undefined if the coin
     * has no explicit weight. WEIGHT keys in the config may be written in any case.
     */
    private getWeight(coin: string): number | undefined {
        const upper = coin.toUpperCase();

        for (const [key, value] of Object.entries(CONFIG.WEIGHT)) {
            if (key.toUpperCase() === upper) {
                return value as number;
            }
        }

        return undefined;
    }

    /**
     * Computes how much of `total` should be allocated to `coin` given the WEIGHT configuration and
     * the set of `coins` currently in play. A coin with an explicit weight receives that exact
     * percentage; the remaining percentage is split equally over all coins without an explicit
     * weight. This is the single source of truth used for DCA investing, market-cap reinvesting and
     * over-performer reinvesting, so weights are honoured consistently everywhere.
     */
    private weightedTarget(coins: string[], coin: string, total: number): number {
        const reservedWeight = Object.entries(CONFIG.WEIGHT).reduce((acc: number, cur: [string, number]) => {
            return coins.includes(cur[0].toUpperCase()) ? acc + cur[1] : acc;
        }, 0);

        const validReservedCoins = Object.entries(CONFIG.WEIGHT).reduce((acc: number, cur) => {
            return coins.includes(cur[0].toUpperCase()) ? acc + 1 : acc;
        }, 0);

        const weight = this.getWeight(coin);

        if (weight !== undefined) {
            return total * (weight / 100);
        }

        const unreservedCoins = coins.length - validReservedCoins;

        if (unreservedCoins <= 0) {
            return 0;
        }

        return total * ((100 - reservedWeight) / 100) / unreservedCoins;
    }

    /**
     * The amount of fresh capital (CONFIG.INVESTMENT) that should be invested into a single coin
     * during a DCA interval, respecting the WEIGHT configuration.
     */
    public getCoinInvestmentTarget(tradableCoins: string[], coin: string): number {
        return this.weightedTarget(tradableCoins, coin, CONFIG.INVESTMENT);
    }

    /**
     * The amount of an arbitrary sum (e.g. the proceeds of a sale during rebalancing) that should be
     * reinvested into a single coin, respecting the WEIGHT configuration. Equal-split is simply the
     * special case where no weights are configured.
     */
    public getReinvestTarget(buyableCoins: string[], coin: string, total: number): number {
        return this.weightedTarget(buyableCoins, coin, total);
    }

    /**
     * The new trailing-stop cost basis after a DCA interval. The basis only ever grows by at most
     * CONFIG.INVESTMENT (the fresh capital the user intends to add each interval), so quote currency
     * generated by rebalancing churn is not mis-counted as new money and does not inflate the basis
     * (issue #24).
     */
    public cappedInvestment(previousInvestment: number, totalInvested: number): number {
        return previousInvestment + Math.min(totalInvested, CONFIG.INVESTMENT);
    }
}
