import { EXCLUDE, INCLUDE, QUOTE, THRESHOLD } from "../config.js";
import { IAccount } from "../interface/IAccount.js";
import { ICoinRemoval } from "../interface/ICoinRemoval.js";
import { IDistributionDelta } from "../interface/IDistributionDelta.js";
import { IInstrument } from "../interface/IInstrument.js";
import { ITicker } from "../interface/ITicker.js";
import { INVESTMENT, WEIGHT } from "../_config.js";

export class Calculation {
    constructor() {}

    public getTradableCoins(instruments: IInstrument[], stablecoins: string[], coins: string[], coinRemovalList?: ICoinRemoval[]) {
        const tradableCoins: string[] = [];

        for (const instrument of instruments) {
            if (instrument.quote_currency.toUpperCase() !== QUOTE.toUpperCase()) {
                continue;
            }

            if (EXCLUDE.includes(instrument.base_currency.toUpperCase())) {
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

        for (const coin of INCLUDE) {
            const tradableCoin = tradableCoins.find((row) => {
                return row === coin;
            });

            if (!tradableCoin) {
                tradableCoins.push(coin);
            }
        }

        if (coinRemovalList) {
            for (const coinRemoval of coinRemovalList) {
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

    public getSharePerCoin(portfolioWorth: number, coins: string[]) {
        return portfolioWorth / coins.length;
    }

    public getPortfolioWorth(balance: IAccount[], tradableCoins: string[], tickers: ITicker[]) {
        let portfolioWorth = 0;

        for (const tradableCoin of tradableCoins) {
            const coin = balance.find((row) => {
                return row.currency.toUpperCase() === tradableCoin;
            });

            if (!coin) {
                continue;
            }

            const ticker = tickers.find((row) => {
                return row.i.split("_")[0].toUpperCase() === coin.currency.toUpperCase() && row.i.split("_")[1].toUpperCase() === QUOTE.toUpperCase();
            });

            if (!ticker) {
                continue;
            }

            portfolioWorth += coin.available * ticker.b;
        }

        return portfolioWorth;
    }

    public getDistributionDelta(sharePerCoin: number, tradableCoins: string[], balance: IAccount[], tickers: ITicker[]) {
        const deviations: IDistributionDelta[] = [];

        for (const tradableCoin of tradableCoins) {
            const coin = balance.find((row) => {
                return row.currency.toUpperCase() === tradableCoin;
            });

            if (!coin) {
                continue;
            }

            const ticker = tickers.find((row) => {
                return row.i.split("_")[0].toUpperCase() === coin.currency.toUpperCase() && row.i.split("_")[1].toUpperCase() === QUOTE.toUpperCase();
            });

            if (!ticker) {
                continue;
            }

            const deviation = (coin.available * ticker.b) - sharePerCoin;

            deviations.push({
                coin: tradableCoin,
                deviation: deviation
            });
        }

        return deviations;
    }

    public getAvailableFunds(balance: IAccount[]) {
        const funds = balance.find((row) => {
            return row.currency.toUpperCase() === QUOTE.toUpperCase();
        });

        if (!funds) {
            return 0;
        }

        return funds.available;
    }

    public getLowestPerformer(distributionDelta: IDistributionDelta[], ignoreList: string[]) {
        let lowestPerformer: IDistributionDelta = null;

        for (const delta of distributionDelta) {
            if (ignoreList.includes(delta.coin)) {
                continue;
            }

            if (!lowestPerformer) {
                lowestPerformer = delta;
                continue;
            }
            
            if (delta.deviation < lowestPerformer.deviation) {
                lowestPerformer = delta;
            }
        }

        return lowestPerformer;
    }

    public getUnderperformerWorth(sharePerCoin: number, distributionDelta: IDistributionDelta[]) {
        let underperformerWorth = 0;

        for (const delta of distributionDelta) {
            const percentageDelta = (((delta.deviation + sharePerCoin) / sharePerCoin) - 1) * 100;

            if (percentageDelta < 0 && Math.abs(percentageDelta) >= THRESHOLD) {
                underperformerWorth += Math.abs(delta.deviation);
            }
        }

        return underperformerWorth;
    }

    public getHighestPerformer(distributionDelta: IDistributionDelta[], ignoreList: string[]) {
        let highestPerformer: IDistributionDelta = null;

        for (const delta of distributionDelta) {
            if (!highestPerformer) {
                highestPerformer = delta;
                continue;
            }
            
            if (!ignoreList.includes(delta.coin)) {
                if (delta.deviation > highestPerformer.deviation) {
                    highestPerformer = delta;
                }
            }
        }

        return highestPerformer;
    }

    public fixNotional(instrument: IInstrument, notional: number) {
        return Math.floor(notional * Math.pow(10, instrument.price_decimals)) / Math.pow(10, instrument.price_decimals);
    }

    public fixQuantity(instrument: IInstrument, quantity: number) {
        return Math.floor(quantity * Math.pow(10, instrument.quantity_decimals)) / Math.pow(10, instrument.quantity_decimals);
    }

    public minimumBuyNotional(instrument: IInstrument, ticker: ITicker) {
        const minPriceNotional = (1 / Math.pow(10, instrument.price_decimals)) * 1.1;
        const minQuantityNotional = (ticker.k / Math.pow(10, instrument.quantity_decimals)) * 1.1;

        return minPriceNotional > minQuantityNotional ? minPriceNotional : minQuantityNotional;
    }

    public getCoinInvestmentTarget(tradableCoins: string[], coin: string): number {
        const reservedWeight = Object.values(WEIGHT).reduce((acc, cur) => {
            return acc + cur;
        });

        return WEIGHT[coin] ? WEIGHT[coin] : INVESTMENT * ((100 - reservedWeight) / 100) / (tradableCoins.length - Object.entries(WEIGHT).length);
    }
}