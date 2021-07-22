import { EXCLUDE, INCLUDE, QUOTE, THRESHOLD, INVESTMENT, WEIGHT } from "../config.js";
import { IAccount } from "../interface/IAccount.js";
import { ICoinRemoval } from "../interface/ICoinRemoval.js";
import { IDistributionDelta } from "../interface/IDistributionDelta.js";
import { IInstrument } from "../interface/IInstrument.js";
import { ITicker } from "../interface/ITicker.js";

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
                const instrument = instruments.find((row) => {
                    return row.base_currency.toUpperCase() === coin && row.quote_currency.toUpperCase() === QUOTE.toUpperCase();
                });

                if (instrument) {
                    tradableCoins.push(coin);
                }
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

    public getDistributionDelta(portfolioWorth: number, tradableCoins: string[], balance: IAccount[], tickers: ITicker[]) {
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

            const reservedWeight = Object.entries(WEIGHT).reduce((acc, cur) => {
                if (tradableCoins.includes(cur[0].toUpperCase())) {
                    return acc + cur[1];
                }
                else {
                    return acc;
                }
            }, 0);

            const validReservedCoins = Object.entries(WEIGHT).reduce((acc, cur) => {
                if (tradableCoins.includes(cur[0].toUpperCase())) {
                    return acc + 1;
                }
                else {
                    return acc;
                }
            }, 0);

            const coinTarget = WEIGHT[tradableCoin] ? portfolioWorth * (WEIGHT[tradableCoin] / 100) : portfolioWorth * ((100 - reservedWeight) / 100) / (tradableCoins.length - validReservedCoins);
            const deviation = (coin.available * ticker.b) - coinTarget;
            const percentageDelta = (((deviation + coinTarget) / coinTarget) - 1) * 100;

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
            return row.currency.toUpperCase() === QUOTE.toUpperCase();
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

    public getUnderperformerWorth(distributionDelta: IDistributionDelta[]) {
        let underperformerWorth = 0;

        for (const coin of distributionDelta) {
            if (coin.percentage <= 0 - THRESHOLD) {
                underperformerWorth += Math.abs(coin.deviation);
            }
        }

        return underperformerWorth;
    }

    public getHighestPerformer(distributionDelta: IDistributionDelta[], ignoreList: string[]) {
        let highestPerformer: IDistributionDelta = null;

        for (const coin of distributionDelta) {
            if (ignoreList.includes(coin.name)) {
                continue;
            }

            if (!highestPerformer) {
                highestPerformer = coin;
                continue;
            }
            
            if (coin.percentage > highestPerformer.percentage) {
                highestPerformer = coin;
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
        const reservedWeight = Object.entries(WEIGHT).reduce((acc, cur) => {
            if (tradableCoins.includes(cur[0])) {
                return acc + cur[1];
            }
            else {
                return acc;
            }
        }, 0);

        const validReservedCoins = Object.entries(WEIGHT).reduce((acc, cur) => {
            if (tradableCoins.includes(cur[0])) {
                return acc + 1;
            }
            else {
                return acc;
            }
        }, 0);

        return WEIGHT[coin] ? INVESTMENT * (WEIGHT[coin] / 100) : INVESTMENT * ((100 - reservedWeight) / 100) / (tradableCoins.length - validReservedCoins);
    }
}