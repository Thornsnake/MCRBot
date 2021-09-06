import axios from "axios";
import { Authentication } from "./Authentication.js";
import { IInstrument } from "../interface/IInstrument.js";
import { Instrument } from "./Instrument.js";
import { CoinGecko } from "./CoinGecko.js";
import { Account } from "./Account.js";
import { Ticker } from "./Ticker.js";
import { Calculation } from "./Calculation.js";
import { CONFIG } from "../config.js";
import { ICoinRemoval } from "../interface/ICoinRemoval.js";
import { Disk } from "./Disk.js";
import { IPortfolioSnapshot } from "../interface/IPortfolioSnapshot.js";
import { IPortfolioATH } from "../interface/IPortfolioATH.js";

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
    private _ticker: Ticker;
    private _calculation: Calculation;
    private _disk: Disk;

    constructor() {
        this._authentication = new Authentication();
        this._instrument = new Instrument();
        this._coinGecko = new CoinGecko();
        this._account = new Account();
        this._ticker = new Ticker();
        this._calculation = new Calculation;
        this._disk = new Disk();
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

    public get Account() {
        return this._account;
    }

    private get Ticker() {
        return this._ticker;
    }

    private get Calculation() {
        return this._calculation;
    }

    private get Disk() {
        return this._disk;
    }

    private async getCoinRemovalList(): Promise<ICoinRemoval[]> {
        const fileExists = await this.Disk.exists("./data/CoinRemovalList.json");

        if (fileExists) {
            const data = await this.Disk.load("./data/CoinRemovalList.json");

            return JSON.parse(data);
        }
        else {
            return [];
        }
    }

    private async setCoinRemovalList(coinRemovalList: ICoinRemoval[]) {
        const directoryExists = await this.Disk.exists("./data");

        if (!directoryExists) {
            await this.Disk.createDirectory("./data", false);
        }

        await this.Disk.save("./data/CoinRemovalList.json", JSON.stringify(coinRemovalList));
    }

    private async setPortfolioSnapshot(portfolioSnapshot: IPortfolioSnapshot) {
        const currentDate = new Date();

        const year = currentDate.getFullYear().toString().padStart(4, "0");
        const month = (currentDate.getMonth() + 1).toString().padStart(2, "0");
        const day = currentDate.getDate().toString().padStart(2, "0");
        const hour = currentDate.getHours().toString().padStart(2, "0");
        const minute = currentDate.getMinutes().toString().padStart(2, "0");

        const directoryExists = await this.Disk.exists(`./data/snapshot/${year}/${month}/${day}`);

        if (!directoryExists) {
            await this.Disk.createDirectory(`./data/snapshot/${year}/${month}/${day}`, true);
        }

        await this.Disk.save(`./data/snapshot/${year}/${month}/${day}/${hour}${minute}.json`, JSON.stringify(portfolioSnapshot));
    }

    private async getPortfolioATH(): Promise<IPortfolioATH> {
        const fileExists = await this.Disk.exists("./data/PortfolioATH.json");

        if (fileExists) {
            const data = await this.Disk.load("./data/PortfolioATH.json");

            return JSON.parse(data);
        }
        else {
            return {
                active: false,
                allTimeHigh: 0,
                investment: 0,
                resume: 0,
                triggered: false
            };
        }
    }

    private async setPortfolioATH(portfolioATH: IPortfolioATH) {
        const directoryExists = await this.Disk.exists("./data");

        if (!directoryExists) {
            await this.Disk.createDirectory("./data", false);
        }

        await this.Disk.save("./data/PortfolioATH.json", JSON.stringify(portfolioATH));
    }

    private minimumSellQuantity(instrument: IInstrument) {
        return (1 / Math.pow(10, instrument.quantity_decimals));
    }

    private async buy(instrument: IInstrument, notional: number, tradeType: ETradeType): Promise<boolean> {
        await new Promise(resolve => setTimeout(resolve, 100));

        if (CONFIG.DRY) {
            return true;
        }

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
                        notional: notional,
                        client_oid: `mcrbot_${tradeType}`
                    },
                    nonce: Date.now()
                }), {timeout: 30000});

            return true;
        }
        catch (err) {
            console.error(`${err.name} - ${err.message}`);

            return false;
        }
    }

    private async sell(instrument: IInstrument, quantity: number, tradeType: ETradeType) {
        await new Promise(resolve => setTimeout(resolve, 100));

        if (CONFIG.DRY) {
            return true;
        }

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
                        quantity: quantity,
                        client_oid: `mcrbot_${tradeType}`
                    },
                    nonce: Date.now()
                }), {timeout: 30000});

            return true;
        }
        catch (err) {
            console.error(`${err.name} - ${err.message}`);

            return false;
        }
    }

    private async rebalanceMarketCaps(instruments: IInstrument[], tradableCoins: string[]) {
        /**
         * Get the current account balance of the user for all coins.
         */
        let balance = await this.Account.all();

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
         * Check if a coin has fallen out of the set market cap bound.
         */
        let shouldContinue = false;

        const coinRemovalList = await this.getCoinRemovalList();

        for (const coinBalance of balance) {
            const instrument = instruments.find((row) => {
                return row.base_currency.toUpperCase() === coinBalance.currency.toUpperCase() && row.quote_currency.toUpperCase() === CONFIG.QUOTE.toUpperCase();
            });

            if (!instrument) {
                continue;
            }

            const ticker = tickers.find((row) => {
                return row.i.toUpperCase().split("_")[0] === coinBalance.currency.toUpperCase() && row.i.toUpperCase().split("_")[1] === CONFIG.QUOTE.toUpperCase();
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
                        execute: Date.now() + 86400000
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
            return;
        }

        /**
        * If a coins has fallen out of the top x coins by market cap, sell the coin and rebalance
        * the money over the other coins.
        */
        let soldCoinWorth = 0;

        for (const coinBalance of balance) {
            const instrument = instruments.find((row) => {
                return row.base_currency.toUpperCase() === coinBalance.currency.toUpperCase() && row.quote_currency.toUpperCase() === CONFIG.QUOTE.toUpperCase();
            });

            if (!instrument) {
                continue;
            }

            const ticker = tickers.find((row) => {
                return row.i.toUpperCase().split("_")[0] === coinBalance.currency.toUpperCase() && row.i.toUpperCase().split("_")[1] === CONFIG.QUOTE.toUpperCase();
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
                const coinRemoval = coinRemovalList.find((row) => {
                    return row.coin === coinBalance.currency.toUpperCase();
                });

                const excluded = CONFIG.EXCLUDE.find((row) => {
                    return row.toUpperCase() === coinBalance.currency.toUpperCase();
                });

                if ((coinRemoval && coinRemoval.execute < Date.now()) || excluded) {
                    console.log(`[CHECK] ${coinBalance.currency.toUpperCase()} should not be in the portfolio`);

                    const sold = await this.sell(instrument, quantity, ETradeType.REBALANCE);

                    if (sold) {
                        soldCoinWorth += quantity * ticker.k;

                        const index = coinRemovalList.findIndex((row) => {
                            return row.coin === coinBalance.currency.toUpperCase();
                        });

                        coinRemovalList.splice(index, 1);

                        console.log(`[SELL] ${coinBalance.currency.toUpperCase()} for ${(quantity * ticker.k).toFixed(2)} ${CONFIG.QUOTE}`);
                    }
                }
            }
        }

        await this.setCoinRemovalList(coinRemovalList);

        /**
         * Get the available funds that are not invested.
         */
        balance = await this.Account.all();

        if (!balance) {
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
         * Calculate the worth that should be invested into each coin.
         */
        const coinWorth = soldCoinWorth / tradableCoins.length;

        /**
         * Re-invest into tradable coins.
         */
        for (const coin of tradableCoins) {
            const instrument = instruments.find((row) => {
                return row.base_currency.toUpperCase() === coin && row.quote_currency.toUpperCase() === CONFIG.QUOTE.toUpperCase();
            });

            if (!instrument) {
                continue;
            }

            const ticker = tickers.find((row) => {
                return row.i.toUpperCase().split("_")[0] === coin && row.i.toUpperCase().split("_")[1] === CONFIG.QUOTE.toUpperCase();
            });

            if (!ticker) {
                continue;
            }

            const minimumNotional = this.Calculation.fixNotional(instrument, this.Calculation.minimumBuyNotional(instrument, ticker));

            if (minimumNotional > soldCoinWorth) {
                continue;
            }

            let buyNotional = this.Calculation.fixNotional(instrument, coinWorth);

            if (buyNotional < minimumNotional) {
                buyNotional = minimumNotional;
            }

            if (buyNotional > soldCoinWorth) {
                buyNotional = this.Calculation.fixNotional(instrument, soldCoinWorth);
            }

            const bought = await this.buy(instrument, buyNotional, ETradeType.REBALANCE);

            if (bought) {
                soldCoinWorth -= buyNotional;

                console.log(`[BUY] ${coin} for ${buyNotional.toFixed(2)} ${CONFIG.QUOTE}`);
            }
        }
    }

    private async rebalanceOverperformers(instruments: IInstrument[], tradableCoins: string[]) {
        /**
         * Get the current account balance of the user for all coins.
         */
        let balance = await this.Account.all();

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
         * Calculate the worth that each coin is deviating from the average.
         */
        const distributionDelta = this.Calculation.getDistributionDelta(portfolioWorth, tradableCoins, balance, tickers);

        for (const coin of distributionDelta) {
            if (coin.percentage >= CONFIG.THRESHOLD) {
                console.log(`[CHECK] ${coin.name} deviates ${coin.deviation.toFixed(2)} ${CONFIG.QUOTE} (${coin.percentage.toFixed(2)}%) -> [OVERPERFORMING]`);
            }
        }

        /**
         * Sell overperforming coins.
         */
        let soldCoinWorth = 0;
        const ignoreList = [];

        for (const tradableCoin of tradableCoins) {
            const instrument = instruments.find((row) => {
                return row.base_currency.toUpperCase() === tradableCoin && row.quote_currency.toUpperCase() === CONFIG.QUOTE.toUpperCase();
            });

            if (!instrument) {
                continue;
            }

            const ticker = tickers.find((row) => {
                return row.i.toUpperCase().split("_")[0] === tradableCoin && row.i.toUpperCase().split("_")[1] === CONFIG.QUOTE.toUpperCase();
            });

            if (!ticker) {
                continue;
            }

            const coin = distributionDelta.find((row) => {
                return row.name === tradableCoin;
            });

            if (coin.percentage < CONFIG.THRESHOLD) {
                continue;
            }

            const quantity = this.Calculation.fixQuantity(instrument, coin.deviation / ticker.b);
            const minimumQuantity = this.minimumSellQuantity(instrument);

            if (quantity < minimumQuantity) {
                continue;
            }

            const sold = await this.sell(instrument, quantity, ETradeType.REBALANCE);

            if (sold) {
                soldCoinWorth += coin.deviation;
                ignoreList.push(coin.name);

                console.log(`[SELL] ${tradableCoin} for ${coin.deviation.toFixed(2)} ${CONFIG.QUOTE}`);
            }
        }

        /**
         * Get the available funds that are not invested.
         */
        balance = await this.Account.all();

        if (!balance) {
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
         * Re-invest into underperforming coins.
         */
        for (let i = 0; i < tradableCoins.length; i++) {
            const lowestPerformer = this.Calculation.getLowestPerformer(distributionDelta, ignoreList);

            if (!lowestPerformer) {
                continue;
            }

            ignoreList.push(lowestPerformer.name);

            const instrument = instruments.find((row) => {
                return row.base_currency.toUpperCase() === lowestPerformer.name && row.quote_currency.toUpperCase() === CONFIG.QUOTE.toUpperCase();
            });

            if (!instrument) {
                continue;
            }

            const ticker = tickers.find((row) => {
                return row.i.toUpperCase().split("_")[0] === lowestPerformer.name && row.i.toUpperCase().split("_")[1] === CONFIG.QUOTE.toUpperCase();
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

            const bought = await this.buy(instrument, buyNotional, ETradeType.REBALANCE);

            if (bought) {
                soldCoinWorth -= buyNotional;

                console.log(`[BUY] ${lowestPerformer.name} for ${buyNotional.toFixed(2)} ${CONFIG.QUOTE}`);
            }
        }
    }

    private async rebalanceUnderperformers(instruments: IInstrument[], tradableCoins: string[]) {
        /**
         * Get the current account balance of the user for all coins.
         */
        let balance = await this.Account.all();

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
         * Calculate the worth that each coin is deviating from the average.
         */
        const distributionDelta = this.Calculation.getDistributionDelta(portfolioWorth, tradableCoins, balance, tickers);
        let ignoreList = [];

        for (const coin of distributionDelta) {
            if (coin.percentage <= 0 - CONFIG.THRESHOLD) {
                ignoreList.push(coin.name);
                console.log(`[CHECK] ${coin.name} deviates ${coin.deviation.toFixed(2)} ${CONFIG.QUOTE} (${coin.percentage.toFixed(2)}%) -> [UNDERPERFORMING]`);
            }
        }

        /**
         * Calculate how much money we need to bring up the underperformers.
         */
        let underperformerWorth = this.Calculation.getUnderperformerWorth(distributionDelta);

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

        for (let i = 0; i < tradableCoins.length; i++) {
            const highestPerformer = this.Calculation.getHighestPerformer(distributionDelta, ignoreList);

            if (!highestPerformer) {
                continue;
            }

            ignoreList.push(highestPerformer.name);

            const instrument = instruments.find((row) => {
                return row.base_currency.toUpperCase() === highestPerformer.name && row.quote_currency.toUpperCase() === CONFIG.QUOTE.toUpperCase();
            });

            if (!instrument) {
                continue;
            }

            const ticker = tickers.find((row) => {
                return row.i.toUpperCase().split("_")[0] === highestPerformer.name && row.i.toUpperCase().split("_")[1] === CONFIG.QUOTE.toUpperCase();
            });

            if (!ticker) {
                continue;
            }

            const sellNotional = Math.abs(highestPerformer.deviation);
            const quantity = this.Calculation.fixQuantity(instrument, sellNotional / ticker.k);
            const minimumQuantity = this.minimumSellQuantity(instrument);

            if (minimumQuantity * ticker.k >= underperformerWorth) {
                continue;
            }

            if (quantity < minimumQuantity) {
                continue;
            }

            const sold = await this.sell(instrument, quantity, ETradeType.REBALANCE);

            if (sold) {
                underperformerWorth -= quantity * ticker.k;
                soldCoinWorth += quantity * ticker.k;

                console.log(`[SELL] ${highestPerformer.name} for ${sellNotional.toFixed(2)} ${CONFIG.QUOTE}`);
            }
        }

        /**
         * Get the available funds that are not invested.
         */
        balance = await this.Account.all();

        if (!balance) {
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
         * Re-invest into underperforming coins.
         */
        ignoreList = [];

        for (let i = 0; i < tradableCoins.length; i++) {
            const lowestPerformer = this.Calculation.getLowestPerformer(distributionDelta, ignoreList);

            if (!lowestPerformer) {
                continue;
            }

            ignoreList.push(lowestPerformer.name);

            const instrument = instruments.find((row) => {
                return row.base_currency.toUpperCase() === lowestPerformer.name && row.quote_currency.toUpperCase() === CONFIG.QUOTE.toUpperCase();
            });

            if (!instrument) {
                continue;
            }

            const ticker = tickers.find((row) => {
                return row.i.toUpperCase().split("_")[0] === lowestPerformer.name && row.i.toUpperCase().split("_")[1] === CONFIG.QUOTE.toUpperCase();
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

            const bought = await this.buy(instrument, buyNotional, ETradeType.REBALANCE);

            if (bought) {
                soldCoinWorth -= buyNotional;

                console.log(`[BUY] ${lowestPerformer.name} for ${buyNotional.toFixed(2)} ${CONFIG.QUOTE}`);
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
         * Invest into coins.
         */
        for (const tradableCoin of tradableCoins) {
            const instrument = instruments.find((row) => {
                return row.base_currency.toUpperCase() === tradableCoin && row.quote_currency.toUpperCase() === CONFIG.QUOTE.toUpperCase();
            });

            if (!instrument) {
                continue;
            }

            const ticker = tickers.find((row) => {
                return row.i.toUpperCase().split("_")[0] === tradableCoin && row.i.toUpperCase().split("_")[1] === CONFIG.QUOTE.toUpperCase();
            });

            if (!ticker) {
                continue;
            }

            const minimumNotional = this.Calculation.fixNotional(instrument, this.Calculation.minimumBuyNotional(instrument, ticker));

            const coinInvestmentTarget = this.Calculation.getCoinInvestmentTarget(tradableCoins, tradableCoin);
            let buyNotional = this.Calculation.fixNotional(instrument, coinInvestmentTarget);

            if (buyNotional < minimumNotional) {
                buyNotional = minimumNotional;
            }

            if (buyNotional > availableFunds) {
                continue;
            }

            const bought = await this.buy(instrument, buyNotional, ETradeType.INVEST);

            if (bought) {
                availableFunds -= buyNotional;

                console.log(`[BUY] ${tradableCoin} for ${buyNotional.toFixed(2)} ${CONFIG.QUOTE}`);
            }
        }

        /**
         * Add the investment to the trailing stop statistics.
         */
        const portfolioATH = await this.getPortfolioATH();
        const investment = portfolioATH.investment + CONFIG.INVESTMENT;

        await this.setPortfolioATH({
            ...portfolioATH,
            investment: investment
        });
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
         * Rebalance
         */
        await this.rebalanceMarketCaps(instruments, tradableCoinsWithoutRemovalList);

        /**
         * Get the actual tradable coins that are both on crypto.com and Coin Gecko and are
         * not stablecoins.
         */
        const coinRemovalList = await this.getCoinRemovalList();
        const tradableCoins = this.Calculation.getTradableCoins(instruments, stablecoins, coins, coinRemovalList);

        /**
         * Rebalance
         */
        await this.rebalanceOverperformers(instruments, tradableCoins);
        await this.rebalanceUnderperformers(instruments, tradableCoins);

        /**
         * Save a snapshot of the new portfolio.
         */
        const balance = await this.Account.all();
        const tickers = await this.Ticker.all();

        if (!balance || !tickers) {
            return;
        }

        const portfolio: IPortfolioSnapshot = {};

        for (const coin of tradableCoins) {
            portfolio[coin] = {
                quantity: balance.find((row) => row.currency.toUpperCase() === coin).available,
                price: tickers.find((row) => row.i.toUpperCase().split("_")[0] === coin && row.i.toUpperCase().split("_")[1] === CONFIG.QUOTE.toUpperCase()).k
            }
        }

        await this.setPortfolioSnapshot(portfolio);
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
         * not stablecoins.
         */
        const coinRemovalList = await this.getCoinRemovalList();
        const tradableCoins = this.Calculation.getTradableCoins(instruments, stablecoins, coins, coinRemovalList);

        /**
         * Invest
         */
        await this.investMoney(instruments, tradableCoins);

        /**
         * Save a snapshot of the new portfolio.
         */
        const balance = await this.Account.all();
        const tickers = await this.Ticker.all();

        if (!balance || !tickers) {
            return;
        }

        const portfolio: IPortfolioSnapshot = {};

        for (const coin of tradableCoins) {
            portfolio[coin] = {
                quantity: balance.find((row) => row.currency.toUpperCase() === coin).available,
                price: tickers.find((row) => row.i.toUpperCase().split("_")[0] === coin && row.i.toUpperCase().split("_")[1] === CONFIG.QUOTE.toUpperCase()).k
            }
        }

        await this.setPortfolioSnapshot(portfolio);
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
                console.log("Trading now resumed after trailing stop hit.");
                portfolioATH.active = false;
                portfolioATH.allTimeHigh = 0;
                portfolioATH.investment = 0;
                portfolioATH.resume = 0;
                portfolioATH.triggered = false;

                /**
                 * Save the current portfolio statistics for the trailing stop.
                 */
                await this.setPortfolioATH(portfolioATH);
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
         * Get the current portfolio worth.
         */
        const portfolioWorth = this.Calculation.getPortfolioWorth(balance, tradableCoins, tickers);

        /**
         * Set the portfolio all time high.
         */
        portfolioATH.allTimeHigh = portfolioWorth > portfolioATH.allTimeHigh ? portfolioWorth : portfolioATH.allTimeHigh;

        /**
         * Check if the trailing stop should be switched to active.
         */
        portfolioATH.active = portfolioATH.active ? portfolioATH.active : ((portfolioATH.allTimeHigh / portfolioATH.investment) - 1) * 100 >= CONFIG.TRAILING_STOP.MIN_PROFIT;

        if (portfolioATH.active) {
            /**
             * Check if the trailing stop should be triggered.
             */
            if (!portfolioATH.triggered) {
                portfolioATH.triggered = ((portfolioATH.allTimeHigh / portfolioWorth) - 1) * 100 >= CONFIG.TRAILING_STOP.MAX_DROP;

                if (portfolioATH.triggered) {
                    const currentDate = new Date();
                    portfolioATH.resume = currentDate.setHours(currentDate.getHours() + CONFIG.TRAILING_STOP.RESUME);

                    /**
                     * Sell all coins in the portfolio to the quote currency.
                     */
                    console.log("Trailing stop hit, selling portfolio.");

                    for (const coin of balance) {
                        const instrument = instruments.find((row) => {
                            return row.base_currency.toUpperCase() === coin.currency.toUpperCase() && row.quote_currency.toUpperCase() === CONFIG.QUOTE.toUpperCase();
                        });

                        if (!instrument) {
                            continue;
                        }

                        const ticker = tickers.find((row) => {
                            return row.i.toUpperCase().split("_")[0] === coin.currency.toUpperCase() && row.i.toUpperCase().split("_")[1] === CONFIG.QUOTE.toUpperCase();
                        });

                        if (!ticker) {
                            continue;
                        }

                        const quantity = this.Calculation.fixQuantity(instrument, coin.available);
                        const minimumQuantity = this.minimumSellQuantity(instrument);

                        if (quantity < minimumQuantity) {
                            continue;
                        }

                        const sold = await this.sell(instrument, quantity, ETradeType.TRAILING_STOP);

                        if (sold) {
                            console.log(`[SELL] ${coin.currency.toUpperCase()} for ${(quantity * ticker.k).toFixed(2)} ${CONFIG.QUOTE}`);
                        }
                    }

                    console.log(`Portfolio sold, trading will resume in ${CONFIG.TRAILING_STOP.RESUME} hours.`);
                }
            }
        }

        /**
         * Save the current portfolio statistics for the trailing stop.
         */
        await this.setPortfolioATH(portfolioATH);
    }
}