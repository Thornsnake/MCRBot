import { MessageBuilder, Webhook } from "discord-webhook-node";
import { CONFIG } from "../config.js";

export enum EMessageType {
    INVEST = "INVEST",
    REBALANCE_MARKET_CAP = "REBALANCE_MARKET_CAP",
    REBALANCE_OVERPERFORMERS = "REBALANCE_OVERPERFORMERS",
    REBALANCE_UNDERPERFORMERS = "REBALANCE_UNDERPERFORMERS",
    TRAILING_STOP = "TRAILING_STOP",
    CONTINUE = "CONTINUE"
}

export enum EMessageDataRebalanceCoinDirection {
    SELL = "SELL",
    BUY = "BUY"
}

export interface IMessageDataRebalanceCoin {
    currency: string;
    amount: number;
    percentage: number;
    direction: EMessageDataRebalanceCoinDirection;
}

export interface IMessageDataRebalance {
    portfolioWorth: number;
    coins: IMessageDataRebalanceCoin[];
}

export interface IMessageDataInvest {
    portfolioWorth: number;
    remainingFunds: number;
    investment: number;
    coinAmount: number;
}

class WebHook {
    private _discordWebHook: Webhook;

    constructor() {
        if (CONFIG["WEBHOOKS"] === undefined) {
            CONFIG["WEBHOOKS"] = {
                DISCORD: {
                    ACTIVE: false,
                    URL: "",
                    POST: {
                        INVEST: true,
                        REBALANCE_MARKET_CAP: true,
                        REBALANCE_OVERPERFORMERS: true,
                        REBALANCE_UNDERPERFORMERS: true,
                        TRAILING_STOP: true,
                        CONTINUE: true
                    }
                }
            };
        }

        this._discordWebHook = new Webhook(CONFIG["WEBHOOKS"]["DISCORD"]["URL"]);
    }

    private get DiscordWebHook() {
        return this._discordWebHook;
    }

    private formatCurrency(value: number) {
        const fractionDigits = CONFIG.QUOTE === "USDC" || CONFIG.QUOTE === "USDT" ? 2 : CONFIG.QUOTE === "BTC" ? 6 : 5;
        const fixedValue = value.toFixed(fractionDigits);
    
        const leftSide = fixedValue.split(".")[0];
        const rightSide = fixedValue.split(".")[1];
    
        const leftSideWithSeparators = leftSide.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
    
        return leftSideWithSeparators + "." + rightSide;
    }

    public sendToDiscord(data: IMessageDataInvest | IMessageDataRebalance | null, type: EMessageType) {
        if (CONFIG["WEBHOOKS"]["DISCORD"]["ACTIVE"]) {
            if (!CONFIG["WEBHOOKS"]["DISCORD"]["URL"] || CONFIG["WEBHOOKS"]["DISCORD"]["URL"].trim().length === 0) {
                return;
            }

            if (type === EMessageType.INVEST && !CONFIG["WEBHOOKS"]["DISCORD"]["POST"]["INVEST"]) {
                return;
            }

            if (type === EMessageType.REBALANCE_MARKET_CAP && !CONFIG["WEBHOOKS"]["DISCORD"]["POST"]["REBALANCE_MARKET_CAP"]) {
                return;
            }

            if (type === EMessageType.REBALANCE_OVERPERFORMERS && !CONFIG["WEBHOOKS"]["DISCORD"]["POST"]["REBALANCE_OVERPERFORMERS"]) {
                return;
            }

            if (type === EMessageType.REBALANCE_UNDERPERFORMERS && !CONFIG["WEBHOOKS"]["DISCORD"]["POST"]["REBALANCE_UNDERPERFORMERS"]) {
                return;
            }

            if (type === EMessageType.TRAILING_STOP && !CONFIG["WEBHOOKS"]["DISCORD"]["POST"]["TRAILING_STOP"]) {
                return;
            }

            if (type === EMessageType.CONTINUE && !CONFIG["WEBHOOKS"]["DISCORD"]["POST"]["CONTINUE"]) {
                return;
            }

            const embed = new MessageBuilder();

            if (type === EMessageType.INVEST) {
                const messageData = <IMessageDataInvest>data;

                embed.setColor(parseInt("0x0b8f19", 16));
                embed.setTitle("New Investment");
                embed.setDescription("More coins have been bought and were added to your portfolio.");
                embed.addField("Investment", `${this.formatCurrency(messageData.investment)} ${CONFIG.QUOTE} [${messageData.coinAmount} coins]`, true);
                embed.addField("Remaining Funds", `${this.formatCurrency(messageData.remainingFunds)} ${CONFIG.QUOTE}`, true);
                embed.addField("Portfolio Worth", `${this.formatCurrency(messageData.portfolioWorth)} ${CONFIG.QUOTE}`, true);
            }
            else if (type === EMessageType.REBALANCE_MARKET_CAP) {
                const messageData = <IMessageDataRebalance>data;

                embed.setColor(parseInt("0x0b8f8f", 16));
                embed.setTitle("Portfolio rebalanced");
                embed.setDescription(`Your portfolio has been rebalanced, because one or more coins fell out of the defined **market cap**.\nCurrent portfolio worth is **${this.formatCurrency(messageData.portfolioWorth)} ${CONFIG.QUOTE}**.`)
                
                for (let i = 0; i < messageData.coins.length && i < 25; i++) {
                    const coin = messageData.coins[i];
                    embed.addField(`${coin.currency}`, `${coin.direction} for ${this.formatCurrency(Math.abs(coin.amount))} ${CONFIG.QUOTE}`, true);
                }
            }
            else if (type === EMessageType.REBALANCE_OVERPERFORMERS) {
                const messageData = <IMessageDataRebalance>data;

                embed.setColor(parseInt("0x0b8f8f", 16));
                embed.setTitle("Portfolio rebalanced");
                embed.setDescription(`Coins in your portfolio were **overperforming**.\nCurrent portfolio worth is **${this.formatCurrency(messageData.portfolioWorth)} ${CONFIG.QUOTE}**.`)
                
                for (let i = 0; i < messageData.coins.length && i < 25; i++) {
                    const coin = messageData.coins[i];
                    embed.addField(`${coin.currency} (${coin.direction === EMessageDataRebalanceCoinDirection.SELL ? "▲" : "▼"} ${coin.percentage.toFixed(2)}%)`, `${coin.direction} for ${this.formatCurrency(Math.abs(coin.amount))} ${CONFIG.QUOTE}`, true);
                }
            }
            else if (type === EMessageType.REBALANCE_UNDERPERFORMERS) {
                const messageData = <IMessageDataRebalance>data;

                embed.setColor(parseInt("0x0b8f8f", 16));
                embed.setTitle("Portfolio rebalanced");
                embed.setDescription(`Coins in your portfolio were **underperforming**.\nCurrent portfolio worth is **${this.formatCurrency(messageData.portfolioWorth)} ${CONFIG.QUOTE}**.`)
                
                for (let i = 0; i < messageData.coins.length && i < 25; i++) {
                    const coin = messageData.coins[i];
                    embed.addField(`${coin.currency} (${coin.direction === EMessageDataRebalanceCoinDirection.SELL ? "▲" : "▼"} ${coin.percentage.toFixed(2)}%)`, `${coin.direction} for ${this.formatCurrency(Math.abs(coin.amount))} ${CONFIG.QUOTE}`, true);
                }
            }
            else if (type === EMessageType.TRAILING_STOP) {
                embed.setColor(parseInt("0xff0000", 16));
                embed.setTitle("Trailing stop has been hit");
                embed.setDescription("Your portfolio has been sold!")
            }
            else if (type === EMessageType.CONTINUE) {
                embed.setColor(parseInt("0xffff00", 16));
                embed.setTitle("Trading resumed");
                embed.setDescription("The bot has resumed its trading activity after the trailing stop had been hit!")
            }

            this.DiscordWebHook.send(
                embed
            ).catch((err) => {
                console.error(err);
            });
        }
    }
}

const _WebHook = new WebHook();
export { _WebHook as WebHook }