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

    public getOrderBookAskWorth(coinAmmount: number, book: IBook) {
        let currencyWorth = 0;
        let currencyAmount = coinAmmount;

        for (const ask of book.asks) {
            const price = ask[0];
            const quantity = ask[1];

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

            const reservedWeight = Object.entries(CONFIG.WEIGHT).reduce((acc: number, cur: [string, number]) => {
                if (tradableCoins.includes(cur[0].toUpperCase())) {
                    return acc + cur[1];
                }
                else {
                    return acc;
                }
            }, 0);

            const validReservedCoins = Object.entries(CONFIG.WEIGHT).reduce((acc, cur) => {
                if (tradableCoins.includes(cur[0].toUpperCase())) {
                    return acc + 1;
                }
                else {
                    return acc;
                }
            }, 0);

            const coinTarget = CONFIG.WEIGHT[tradableCoin] ? portfolioWorth * (CONFIG.WEIGHT[tradableCoin] / 100) : portfolioWorth * ((100 - reservedWeight) / 100) / (tradableCoins.length - validReservedCoins);
            const deviation = (this.getOrderBookBidWorth(coin.available, orderBook)) - coinTarget;

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

    public getUnderperformerWorth(instruments: IInstrument[], book: IBook[], distributionDelta: IDistributionDelta[]) {
        let underperformerWorth = 0;
        let minimumBuyNotional = 0;

        for (const coin of distributionDelta) {
            if (coin.percentage <= 0 - CONFIG.THRESHOLD) {
                const instrument = instruments.find((row) => {
                    return row.base_currency.toUpperCase() === coin.name && row.quote_currency.toUpperCase() === CONFIG.QUOTE.toUpperCase();
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

                const minimumNotional = this.fixNotional(instrument, this.minimumBuyNotional(instrument, orderBook));

                underperformerWorth += Math.abs(coin.deviation);
                minimumBuyNotional += minimumNotional;
            }
        }

        if (underperformerWorth <= minimumBuyNotional * 1.1) {
            underperformerWorth = 0;
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

    public minimumBuyNotional(instrument: IInstrument, book: IBook) {
        const minPriceNotional = (1 / Math.pow(10, instrument.price_decimals)) * 1.1;
        const minQuantityNotional = (book.asks[0][0] / Math.pow(10, instrument.quantity_decimals)) * 1.1;

        return minPriceNotional > minQuantityNotional ? minPriceNotional : minQuantityNotional;
    }

    public minimumSellQuantity(instrument: IInstrument) {
        return (1 / Math.pow(10, instrument.quantity_decimals));
    }

    public getCoinInvestmentTarget(tradableCoins: string[], coin: string): number {
        const reservedWeight = Object.entries(CONFIG.WEIGHT).reduce((acc: number, cur: [string, number]) => {
            if (tradableCoins.includes(cur[0])) {
                return acc + cur[1];
            }
            else {
                return acc;
            }
        }, 0);

        const validReservedCoins = Object.entries(CONFIG.WEIGHT).reduce((acc, cur) => {
            if (tradableCoins.includes(cur[0])) {
                return acc + 1;
            }
            else {
                return acc;
            }
        }, 0);

        return CONFIG.WEIGHT[coin] ? CONFIG.INVESTMENT * (CONFIG.WEIGHT[coin] / 100) : CONFIG.INVESTMENT * ((100 - reservedWeight) / 100) / (tradableCoins.length - validReservedCoins);
    }
}