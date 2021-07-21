import axios from "axios";
import { Authentication } from "./Authentication.js";
import { IInstrument } from "../interface/IInstrument.js";
import { Instrument } from "./Instrument.js";
import { CoinGecko } from "./CoinGecko.js";
import { Account } from "./Account.js";
import { Ticker } from "./Ticker.js";
import { Calculation } from "./Calculation.js";
import { INVESTMENT, QUOTE, THRESHOLD, TOP } from "../config.js";
import { ICoinRemoval } from "../interface/ICoinRemoval.js";
import { EXCLUDE } from "../_config.js";

export class Trade {
    private _authentication: Authentication;
    private _instrument: Instrument;
    private _coinGecko: CoinGecko;
    private _account: Account;
    private _ticker: Ticker;
    private _calculation: Calculation;

    private _coinRemovalList: ICoinRemoval[];

    constructor() {
        this._authentication = new Authentication();
        this._instrument = new Instrument();
        this._coinGecko = new CoinGecko();
        this._account = new Account();
        this._ticker = new Ticker();
        this._calculation = new Calculation;

        this._coinRemovalList = [];
    }

    private get Authentication() {
        return this._authentication;
    }

    private get Instrument() {
        return this._instrument;
    }

    private get Coingecko() {
        return this._coinGecko;
    }

    private get Account() {
        return this._account;
    }

    private get Ticker() {
        return this._ticker;
    }

    private get Calculation() {
        return this._calculation;
    }

    private get CoinRemovalList() {
        return this._coinRemovalList;
    }

    private minimumSellQuantity(instrument: IInstrument) {
        return (1 / Math.pow(10, instrument.quantity_decimals));
    }

    private async buy(instrument: IInstrument, notional: number): Promise<boolean> {
        await new Promise(resolve => setTimeout(resolve, 100));

        try {
            await axios.post(
                "https://api.crypto.com/v2/private/create-order",
                this.Authentication.sign({
                    id: 2,
                    method: "private/create-order",
                    params: {
                        instrument_name: instrument.instrument_name,
                        side: "BUY",
                        type: "MARKET",
                        notional: notional
                    },
                    nonce: Date.now()
                })
            );

            return true;
        }
        catch (err) {
            console.error(err);

            return false;
        }
    }

    private async sell(instrument: IInstrument, quantity: number) {
        await new Promise(resolve => setTimeout(resolve, 100));

        try {
            await axios.post(
                "https://api.crypto.com/v2/private/create-order",
                this.Authentication.sign({
                    id: 3,
                    method: "private/create-order",
                    params: {
                        instrument_name: instrument.instrument_name,
                        side: "SELL",
                        type: "MARKET",
                        quantity: quantity
                    },
                    nonce: Date.now()
                })
            );

            return true;
        }
        catch (err) {
            console.error(err);

            return false;
        }
    }

    private async rebalanceMarketCaps(instruments: IInstrument[], tradableCoins: string[]) {
        /**
         * Get the current account balance of the user for all coins.
         */
        const balance = await this.Account.all();

        /**
         * Get the ticker for all instruments on crypto.com.
         */
        const tickers = await this.Ticker.all();

        /**
         * Make sure everything is present.
         */
        if (!balance || !tickers) {
            return;
        }

        /**
         * Calculate the current portfolio worth.
         */
        const portfolioWorth = this.Calculation.getPortfolioWorth(balance, tradableCoins, tickers);

        /**
         * If the portfolio worth is zero, there is nothing to rebalance and we can abort.
         */
        if (portfolioWorth === 0) {
            return;
        }

        /**
         * Calculate the share worth that each coin should have.
         */
        const sharePerCoin = this.Calculation.getSharePerCoin(portfolioWorth, tradableCoins);

        /**
         * Calculate the worth that each coin is deviating from the average.
         */
        const distributionDelta = this.Calculation.getDistributionDelta(sharePerCoin, tradableCoins, balance, tickers);

        /**
         * Check if a coin has fallen out of the set market cap bound.
         */
        let shouldContinue = false;

        for (const coinBalance of balance) {
            const instrument = instruments.find((row) => {
                return row.base_currency.toUpperCase() === coinBalance.currency.toUpperCase() && row.quote_currency.toUpperCase() === QUOTE.toUpperCase();
            });

            if (!instrument) {
                continue;
            }

            const ticker = tickers.find((row) => {
                return row.i.toUpperCase().split("_")[0] === coinBalance.currency.toUpperCase() && row.i.toUpperCase().split("_")[1] === QUOTE.toUpperCase();
            });

            if (!ticker) {
                continue;
            }

            const quantity = this.Calculation.fixQuantity(instrument, coinBalance.available);
            const minimumQuantity = this.minimumSellQuantity(instrument);

            if (quantity < minimumQuantity) {
                continue;
            }

            if (!tradableCoins.includes(coinBalance.currency.toUpperCase())) {
                const coinRemoval = this.CoinRemovalList.find((row) => {
                    return row.coin === coinBalance.currency.toUpperCase();
                });

                const excluded = EXCLUDE.find((row) => {
                    return row.toUpperCase() === coinBalance.currency.toUpperCase();
                });

                if (excluded) {
                    shouldContinue = true;
                }
                
                if (!coinRemoval) {
                    this.CoinRemovalList.push({
                        coin: coinBalance.currency.toUpperCase(),
                        execute: Date.now() + 86400000
                    });
                }
                else if (coinRemoval.execute < Date.now()) {
                    shouldContinue = true;
                }
            }
            else {
                const index = this.CoinRemovalList.findIndex((row) => {
                    return row.coin === coinBalance.currency.toUpperCase();
                });

                if (index > -1) {
                    this.CoinRemovalList.splice(index, 1);
                }
            }
        }

        if (!shouldContinue) {
            return;
        }

        console.log(``);
        console.log(``);
        console.log(`----------------------------------------------------------------`);
        console.log(`------------------- REBALANCE - Invalid Coins ------------------`);
        console.log(`----------------------------------------------------------------`);
        console.log(`One or more coins do not fulfill the trading conditions.`);
        console.log(``);

        /**
        * If a coins has fallen out of the top x coins by market cap, sell the coin and rebalance
        * the money over the other coins.
        */
        let soldCoinWorth = 0;

        for (const coinBalance of balance) {
            const instrument = instruments.find((row) => {
                return row.base_currency.toUpperCase() === coinBalance.currency.toUpperCase() && row.quote_currency.toUpperCase() === QUOTE.toUpperCase();
            });

            if (!instrument) {
                continue;
            }

            const ticker = tickers.find((row) => {
                return row.i.toUpperCase().split("_")[0] === coinBalance.currency.toUpperCase() && row.i.toUpperCase().split("_")[1] === QUOTE.toUpperCase();
            });

            if (!ticker) {
                continue;
            }

            const quantity = this.Calculation.fixQuantity(instrument, coinBalance.available);
            const minimumQuantity = this.minimumSellQuantity(instrument);

            if (quantity < minimumQuantity) {
                continue;
            }

            if (!tradableCoins.includes(coinBalance.currency.toUpperCase())) {
                const coinRemoval = this.CoinRemovalList.find((row) => {
                    return row.coin === coinBalance.currency.toUpperCase();
                });

                const excluded = EXCLUDE.find((row) => {
                    return row.toUpperCase() === coinBalance.currency.toUpperCase();
                });

                if ((coinRemoval && coinRemoval.execute < Date.now()) || excluded) {
                    const sold = await this.sell(instrument, quantity);

                    if (sold) {
                        soldCoinWorth += quantity * ticker.k;

                        const index = this.CoinRemovalList.findIndex((row) => {
                            return row.coin === coinBalance.currency.toUpperCase();
                        });

                        this.CoinRemovalList.splice(index, 1);

                        console.log(`[SELL] ${coinBalance.currency.toUpperCase()} for ${(quantity * ticker.k).toFixed(2)} ${QUOTE}`);
                    }
                }
            }
        }

        /**
         * Get the available funds that are not invested.
         */
        const availableFunds = this.Calculation.getAvailableFunds(balance);

        /**
         * Make sure the re-investable worth of coins is not higher than the available funds.
         */
        if (soldCoinWorth > availableFunds) {
            soldCoinWorth = availableFunds;
        }

        /**
         * Re-invest into underperforming coins.
         */
        const ignoreList = [];

        for (let i = 0; i < tradableCoins.length; i++) {
            const lowestPerformer = this.Calculation.getLowestPerformer(distributionDelta, ignoreList);
            ignoreList.push(lowestPerformer.coin);

            const instrument = instruments.find((row) => {
                return row.base_currency.toUpperCase() === lowestPerformer.coin && row.quote_currency.toUpperCase() === QUOTE.toUpperCase();
            });

            if (!instrument) {
                continue;
            }

            const ticker = tickers.find((row) => {
                return row.i.toUpperCase().split("_")[0] === lowestPerformer.coin && row.i.toUpperCase().split("_")[1] === QUOTE.toUpperCase();
            });

            if (!ticker) {
                continue;
            }

            const minimumNotional = this.Calculation.fixNotional(instrument, this.Calculation.minimumBuyNotional(instrument, ticker));

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

            const bought = await this.buy(instrument, buyNotional);

            if (bought) {
                soldCoinWorth -= buyNotional;

                console.log(`[BUY] ${lowestPerformer.coin} for ${buyNotional.toFixed(2)} ${QUOTE}`);
            }
        }
    }

    private async rebalanceOverperformers(instruments: IInstrument[], tradableCoins: string[]) {
        /**
         * Get the current account balance of the user for all coins.
         */
        const balance = await this.Account.all();

        /**
         * Get the ticker for all instruments on crypto.com.
         */
        const tickers = await this.Ticker.all();

        /**
         * Make sure everything is present.
         */
        if (!balance || !tickers) {
            return;
        }

        /**
         * Calculate the current portfolio worth.
         */
        const portfolioWorth = this.Calculation.getPortfolioWorth(balance, tradableCoins, tickers);

        /**
         * If the portfolio worth is zero, there is nothing to rebalance and we can abort.
         */
        if (portfolioWorth === 0) {
            return;
        }

        /**
         * Calculate the share worth that each coin should have.
         */
        const sharePerCoin = this.Calculation.getSharePerCoin(portfolioWorth, tradableCoins);

        /**
         * Get the available funds that are not invested.
         */
        let availableFunds = this.Calculation.getAvailableFunds(balance);

        console.log(``);
        console.log(``);
        console.log(`----------------------------------------------------------------`);
        console.log(`------------------ REBALANCE - Overperformers ------------------`);
        console.log(`----------------------------------------------------------------`);
        console.log(`Portfolio Worth: ${portfolioWorth.toFixed(2)} ${QUOTE} | Available Funds: ${availableFunds.toFixed(2)} ${QUOTE}`);
        console.log(`Coin Target: ${sharePerCoin.toFixed(2)} ${QUOTE} | Threshold: ${THRESHOLD.toFixed(2)}%`);
        console.log(``);

        /**
         * Calculate the worth that each coin is deviating from the average.
         */
        const distributionDelta = this.Calculation.getDistributionDelta(sharePerCoin, tradableCoins, balance, tickers);

        for (const delta of distributionDelta) {
            const percentageDelta = (((delta.deviation + sharePerCoin) / sharePerCoin) - 1) * 100;

            console.log(`[CHECK] ${delta.coin} deviates ${delta.deviation.toFixed(2)} ${QUOTE} (${percentageDelta.toFixed(2)}%)${percentageDelta >= THRESHOLD ? " -> [MARKED]" : ""}`);
        }

        /**
         * Sell overperforming coins.
         */
        let soldCoinWorth = 0;

        for (const tradableCoin of tradableCoins) {
            const instrument = instruments.find((row) => {
                return row.base_currency.toUpperCase() === tradableCoin && row.quote_currency.toUpperCase() === QUOTE.toUpperCase();
            });

            if (!instrument) {
                continue;
            }

            const ticker = tickers.find((row) => {
                return row.i.toUpperCase().split("_")[0] === tradableCoin && row.i.toUpperCase().split("_")[1] === QUOTE.toUpperCase();
            });

            if (!ticker) {
                continue;
            }

            const coinDelta = distributionDelta.find((row) => {
                return row.coin === tradableCoin;
            }).deviation;

            const percentageDelta = (((coinDelta + sharePerCoin) / sharePerCoin) - 1) * 100;

            if (percentageDelta < THRESHOLD) {
                continue;
            }

            const quantity = this.Calculation.fixQuantity(instrument, coinDelta / ticker.b);
            const minimumQuantity = this.minimumSellQuantity(instrument);

            if (quantity < minimumQuantity) {
                continue;
            }

            const sold = await this.sell(instrument, quantity);

            if (sold) {
                soldCoinWorth += coinDelta;

                console.log(`[SELL] ${tradableCoin} for ${coinDelta.toFixed(2)} ${QUOTE}`);
            }
        }

        /**
         * Get the available funds that are not invested.
         */
        availableFunds = this.Calculation.getAvailableFunds(balance);

        /**
         * Make sure the re-investable worth of coins is not higher than the available funds.
         */
        if (soldCoinWorth > availableFunds) {
            soldCoinWorth = availableFunds;
        }

        /**
         * Re-invest into underperforming coins.
         */
        const ignoreList = [];

        for (let i = 0; i < tradableCoins.length; i++) {
            const lowestPerformer = this.Calculation.getLowestPerformer(distributionDelta, ignoreList);
            ignoreList.push(lowestPerformer.coin);

            const instrument = instruments.find((row) => {
                return row.base_currency.toUpperCase() === lowestPerformer.coin && row.quote_currency.toUpperCase() === QUOTE.toUpperCase();
            });

            if (!instrument) {
                continue;
            }

            const ticker = tickers.find((row) => {
                return row.i.toUpperCase().split("_")[0] === lowestPerformer.coin && row.i.toUpperCase().split("_")[1] === QUOTE.toUpperCase();
            });

            if (!ticker) {
                continue;
            }

            const minimumNotional = this.Calculation.fixNotional(instrument, this.Calculation.minimumBuyNotional(instrument, ticker));

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

            const bought = await this.buy(instrument, buyNotional);

            if (bought) {
                soldCoinWorth -= buyNotional;

                console.log(`[BUY] ${lowestPerformer.coin} for ${buyNotional.toFixed(2)} ${QUOTE}`);
            }
        }
    }

    private async rebalanceUnderperformers(instruments: IInstrument[], tradableCoins: string[]) {
        /**
         * Get the current account balance of the user for all coins.
         */
        const balance = await this.Account.all();

        /**
         * Get the ticker for all instruments on crypto.com.
         */
        const tickers = await this.Ticker.all();

        /**
         * Make sure everything is present.
         */
        if (!balance || !tickers) {
            return;
        }

        /**
         * Calculate the current portfolio worth.
         */
        const portfolioWorth = this.Calculation.getPortfolioWorth(balance, tradableCoins, tickers);

        /**
         * If the portfolio worth is zero, there is nothing to rebalance and we can abort.
         */
        if (portfolioWorth === 0) {
            return;
        }

        /**
         * Calculate the share worth that each coin should have.
         */
        const sharePerCoin = this.Calculation.getSharePerCoin(portfolioWorth, tradableCoins);

        /**
         * Get the available funds that are not invested.
         */
        let availableFunds = this.Calculation.getAvailableFunds(balance);

        console.log(``);
        console.log(``);
        console.log(`----------------------------------------------------------------`);
        console.log(`------------------ REBALANCE - Underperformers -----------------`);
        console.log(`----------------------------------------------------------------`);
        console.log(`Portfolio Worth: ${portfolioWorth.toFixed(2)} ${QUOTE} | Available Funds: ${availableFunds.toFixed(2)} ${QUOTE}`);
        console.log(`Coin Target: ${sharePerCoin.toFixed(2)} ${QUOTE} | Threshold: ${THRESHOLD.toFixed(2)}%`);
        console.log(``);

        /**
         * Calculate the worth that each coin is deviating from the average.
         */
        const distributionDelta = this.Calculation.getDistributionDelta(sharePerCoin, tradableCoins, balance, tickers);

        for (const delta of distributionDelta) {
            const percentageDelta = (((delta.deviation + sharePerCoin) / sharePerCoin) - 1) * 100;

            console.log(`[CHECK] ${delta.coin} deviates ${delta.deviation.toFixed(2)} ${QUOTE} (${percentageDelta.toFixed(2)}%)${percentageDelta <= 0 - THRESHOLD ? " -> [MARKED]" : ""}`);
        }

        /**
         * Calculate how much money we need to bring up the underperformers.
         */
        let underperformerWorth = this.Calculation.getUnderperformerWorth(sharePerCoin, distributionDelta);

        /**
         * Make sure the worth of the underperformers is not higher than the portfolio worth.
         */
        if (underperformerWorth > portfolioWorth) {
            underperformerWorth = portfolioWorth;
        }

        /**
         * Sell well performing coins until we have enough money to bring up the underperformers.
         */
        let soldCoinWorth = 0;
        let ignoreList = [];

        for (let i = 0; i < tradableCoins.length; i++) {
            const highestPerformer = this.Calculation.getHighestPerformer(distributionDelta, ignoreList);
            ignoreList.push(highestPerformer.coin);

            const instrument = instruments.find((row) => {
                return row.base_currency.toUpperCase() === highestPerformer.coin && row.quote_currency.toUpperCase() === QUOTE.toUpperCase();
            });

            if (!instrument) {
                continue;
            }

            const ticker = tickers.find((row) => {
                return row.i.toUpperCase().split("_")[0] === highestPerformer.coin && row.i.toUpperCase().split("_")[1] === QUOTE.toUpperCase();
            });

            if (!ticker) {
                continue;
            }

            const sellNotional = Math.abs(highestPerformer.deviation);
            const quantity = this.Calculation.fixQuantity(instrument, sellNotional / ticker.k);
            const minimumQuantity = this.minimumSellQuantity(instrument);

            if (minimumQuantity * ticker.k >= underperformerWorth) {
                break;
            }

            if (quantity < minimumQuantity) {
                continue;
            }

            const sold = await this.sell(instrument, quantity);

            if (sold) {
                underperformerWorth -= quantity * ticker.k;
                soldCoinWorth += quantity * ticker.k;

                console.log(`[SELL] ${highestPerformer.coin} for ${sellNotional.toFixed(2)} ${QUOTE}`);
            }
        }

        /**
         * Get the available funds that are not invested.
         */
        availableFunds = this.Calculation.getAvailableFunds(balance);

        /**
         * Make sure the re-investable worth of coins is not higher than the available funds.
         */
        if (soldCoinWorth > availableFunds) {
            soldCoinWorth = availableFunds;
        }

        /**
         * Re-invest into underperforming coins.
         */
        ignoreList = [];

        for (let i = 0; i < tradableCoins.length; i++) {
            const lowestPerformer = this.Calculation.getLowestPerformer(distributionDelta, ignoreList);
            ignoreList.push(lowestPerformer.coin);

            const instrument = instruments.find((row) => {
                return row.base_currency.toUpperCase() === lowestPerformer.coin && row.quote_currency.toUpperCase() === QUOTE.toUpperCase();
            });

            if (!instrument) {
                continue;
            }

            const ticker = tickers.find((row) => {
                return row.i.toUpperCase().split("_")[0] === lowestPerformer.coin && row.i.toUpperCase().split("_")[1] === QUOTE.toUpperCase();
            });

            if (!ticker) {
                continue;
            }

            const minimumNotional = this.Calculation.fixNotional(instrument, this.Calculation.minimumBuyNotional(instrument, ticker));

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

            const bought = await this.buy(instrument, buyNotional);

            if (bought) {
                soldCoinWorth -= buyNotional;

                console.log(`[BUY] ${lowestPerformer.coin} for ${buyNotional.toFixed(2)} ${QUOTE}`);
            }
        }
    }

    private async investMoney(instruments: IInstrument[], tradableCoins: string[]) {
        /**
         * Get the current account balance of the user for all coins.
         */
        const balance = await this.Account.all();

        /**
         * Get the ticker for all instruments on crypto.com.
         */
        const tickers = await this.Ticker.all();

        /**
         * Make sure everything is present.
         */
        if (!balance || !tickers) {
            return;
        }

        /**
         * Calculate the current portfolio worth.
         */
        const portfolioWorth = this.Calculation.getPortfolioWorth(balance, tradableCoins, tickers);

        /**
         * Get the available funds that are not invested.
         */
        let availableFunds = this.Calculation.getAvailableFunds(balance);

        /**
         * Get the investment worth.
         */
        let coinWorth = INVESTMENT / tradableCoins.length;

        console.log(``);
        console.log(``);
        console.log(`----------------------------------------------------------------`);
        console.log(`---------------------------- INVEST ----------------------------`);
        console.log(`----------------------------------------------------------------`);
        console.log(`Portfolio Worth: ${portfolioWorth.toFixed(2)} ${QUOTE} | Available Funds: ${availableFunds.toFixed(2)} ${QUOTE}`);
        console.log(`Investing ${INVESTMENT.toFixed(2)} ${QUOTE} (${tradableCoins.length} x ${coinWorth.toFixed(2)} ${QUOTE}).`);
        console.log(``);

        /**
         * Make sure the investment worth is not higher than the available funds.
         */
        if (INVESTMENT > availableFunds) {
            console.log(`Not enough funds!`);
            return;
        }

        /**
         * Invest into coins.
         */
        for (const tradableCoin of tradableCoins) {
            const instrument = instruments.find((row) => {
                return row.base_currency.toUpperCase() === tradableCoin && row.quote_currency.toUpperCase() === QUOTE.toUpperCase();
            });

            if (!instrument) {
                continue;
            }

            const ticker = tickers.find((row) => {
                return row.i.toUpperCase().split("_")[0] === tradableCoin && row.i.toUpperCase().split("_")[1] === QUOTE.toUpperCase();
            });

            if (!ticker) {
                continue;
            }

            const minimumNotional = this.Calculation.fixNotional(instrument, this.Calculation.minimumBuyNotional(instrument, ticker));

            let buyNotional = this.Calculation.fixNotional(instrument, coinWorth);

            if (buyNotional < minimumNotional) {
                buyNotional = minimumNotional;
            }

            if (buyNotional > availableFunds) {
                continue;
            }

            const bought = await this.buy(instrument, buyNotional);

            if (bought) {
                availableFunds -= buyNotional;

                console.log(`[BUY] ${tradableCoin} for ${buyNotional.toFixed(2)} ${QUOTE}`);
            }
        }
    }

    public async rebalance() {
        /**
         * Get all instruments that are available on crypto.com.
         */
        const instruments = await this.Instrument.all();

        /**
         * Get a list of stablecoins in the top X by market cap from Coin Gecko.
         */
        const stablecoins = await this.Coingecko.getStablecoins();

        /**
         * Get a list of coins in the top X by market cap from Coin Gecko.
         */
        const coins = await this.Coingecko.getCoins();

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
         * Rebalance
         */
        await this.rebalanceMarketCaps(instruments, tradableCoinsWithoutRemovalList);

        /**
         * Get the actual tradable coins that are both on crypto.com and Coin Gecko and are
         * not stablecoins.
         */
        const tradableCoins = this.Calculation.getTradableCoins(instruments, stablecoins, coins, this.CoinRemovalList);

        /**
         * Rebalance
         */
        await this.rebalanceOverperformers(instruments, tradableCoins);
        await this.rebalanceUnderperformers(instruments, tradableCoins);
    }

    public async invest() {
        /**
         * Get all instruments that are available on crypto.com.
         */
        const instruments = await this.Instrument.all();

        /**
         * Get a list of stablecoins in the top X by market cap from Coin Gecko.
         */
        const stablecoins = await this.Coingecko.getStablecoins();

        /**
         * Get a list of coins in the top X by market cap from Coin Gecko.
         */
        const coins = await this.Coingecko.getCoins();

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
        const tradableCoins = this.Calculation.getTradableCoins(instruments, stablecoins, coins, this.CoinRemovalList);

        /**
         * Invest
         */
        await this.investMoney(instruments, tradableCoins);
    }
}