import axios from "axios";
import { Authentication } from "./Authentication.js";
import { IInstrument } from "../interface/IInstrument.js";
import { Instrument } from "./Instrument.js";
import { CoinGecko } from "./CoinGecko.js";
import { Account } from "./Account.js";
import { Calculation } from "./Calculation.js";
import { CONFIG } from "../config.js";
import { ICoinRemoval } from "../interface/ICoinRemoval.js";
import { Disk } from "./Disk.js";
import { IPortfolioATH } from "../interface/IPortfolioATH.js";
import { IAccount } from "../interface/IAccount.js";
import { EMessageDataRebalanceCoinDirection, EMessageType, IMessageDataInvest, IMessageDataRebalance, WebHook } from "./WebHook.js";
import { Book } from "./Book.js";

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
    private _disk: Disk;

    constructor() {
        this._authentication = new Authentication();
        this._instrument = new Instrument();
        this._coinGecko = new CoinGecko();
        this._account = new Account();
        this._book = new Book();
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

    public get Book() {
        return this._book;
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
                }), { timeout: 30000 });

            return true;
        }
        catch (err) {
            console.error(err);

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
                }), { timeout: 30000 });

            return true;
        }
        catch (err) {
            console.error(err);

            return false;
        }
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

                    const sold = await this.sell(instrument, quantity, ETradeType.REBALANCE);

                    if (sold) {
                        soldCoinWorth += this.Calculation.getOrderBookBidWorth(quantity, orderBook);

                        const index = coinRemovalList.findIndex((row) => {
                            return row.coin === coinBalance.currency.toUpperCase();
                        });

                        coinRemovalList.splice(index, 1);

                        console.log(`[SELL] ${coinBalance.currency.toUpperCase()} for ${(soldCoinWorth)} ${CONFIG.QUOTE}`);

                        webhookData.coins.push({
                            currency: coinBalance.currency.toUpperCase(),
                            amount: soldCoinWorth,
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
         * Calculate the worth that should be invested into each coin.
         */
        const coinWorth = soldCoinWorth / tradableCoinsWithoutRemovalList.length;

        /**
         * Re-invest into tradable coins.
         */
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

                console.log(`[BUY] ${coin} for ${buyNotional} ${CONFIG.QUOTE}`);

                webhookData.coins.push({
                    currency: coin,
                    amount: buyNotional,
                    percentage: 0,
                    direction: EMessageDataRebalanceCoinDirection.BUY
                });
            }
        }

        if (webhookData.coins.length > 0) {
            WebHook.sendToDiscord(webhookData, EMessageType.REBALANCE_MARKET_CAP);
        }

        return hadWorkToDo;
    }

    private async rebalanceOverperformers(instruments: IInstrument[], tradableCoins: string[]) {
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
        const ignoreList = [];

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

            const sold = await this.sell(instrument, quantity, ETradeType.REBALANCE);

            if (sold) {
                soldCoinWorth += coin.deviation;
                ignoreList.push(coin.name);

                console.log(`[SELL] ${tradableCoin} for ${coin.deviation} ${CONFIG.QUOTE}`);

                webhookData.coins.push({
                    currency: tradableCoin,
                    amount: coin.deviation,
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

            const bought = await this.buy(instrument, buyNotional, ETradeType.REBALANCE);

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

        if (webhookData.coins.length > 0) {
            WebHook.sendToDiscord(webhookData, EMessageType.REBALANCE_OVERPERFORMERS);
        }

        return hadWorkToDo;
    }

    private async investMoney(instruments: IInstrument[], tradableCoins: string[]) {
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
         * Invest into coins.
         */
        let totalInvestment = 0;

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

            const minimumNotional = this.Calculation.fixNotional(instrument, this.Calculation.minimumBuyNotional(instrument, orderBook));

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
                totalInvestment += buyNotional;

                console.log(`[BUY] ${tradableCoin} for ${buyNotional} ${CONFIG.QUOTE}`);
            }
        }

        /**
         * Add the investment to the trailing stop statistics.
         */
        const portfolioATH = await this.getPortfolioATH();
        let investment = portfolioATH.investment + totalInvestment;

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

        /**
         * Create information for the webhook message.
         */
        const webhookData: IMessageDataInvest = {
            investment: totalInvestment,
            remainingFunds: availableFunds,
            coinAmount: tradableCoins.length,
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
         * Rebalance
         */
        const overperformersRebalanced = await this.rebalanceOverperformers(instruments, tradableCoins);
        //const underperformersRebalanced = await this.rebalanceUnderperformers(instruments, tradableCoins);

        /**
         * Write that the bot had nothing to do if that is the case.
         */
        if (!marketCapRebalanced && !overperformersRebalanced/* && !underperformersRebalanced*/) {
            if (CONFIG["IDLE_MESSAGE"]) {
                console.log(CONFIG["IDLE_MESSAGE"]);
            }
        }
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
                portfolioATH.triggered = ((portfolioATH.allTimeHigh / portfolioWorth) - 1) * 100 >= CONFIG.TRAILING_STOP.MAX_DROP;

                if (portfolioATH.triggered) {
                    const currentDate = new Date();
                    portfolioATH.resume = currentDate.setHours(currentDate.getHours() + CONFIG.TRAILING_STOP.RESUME);

                    /**
                     * Sell all coins in the portfolio to the quote currency.
                     */
                    console.log("Trailing stop hit, selling portfolio");

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

                        const sold = await this.sell(instrument, quantity, ETradeType.TRAILING_STOP);

                        if (sold) {
                            console.log(`[SELL] ${coin.currency.toUpperCase()} for ${(this.Calculation.getOrderBookBidWorth(quantity, orderBook))} ${CONFIG.QUOTE}`);
                        }
                    }

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
            }
        }

        /**
         * Save the current portfolio statistics for the trailing stop.
         */
        await this.setPortfolioATH(portfolioATH);
    }
}