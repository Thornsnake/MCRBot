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
                embed.setDescription("More coins have been bought.");
                embed.addField("Investment", `${messageData.investment} ${CONFIG.QUOTE}`, true);
                embed.addField("Coins", `${messageData.coinAmount}`, true);
                embed.addField("Remaining Funds", `${messageData.remainingFunds} ${CONFIG.QUOTE}`, true);
                embed.addField("Portfolio Worth", `${messageData.portfolioWorth} ${CONFIG.QUOTE}`, true);
            }
            else if (type === EMessageType.REBALANCE_MARKET_CAP) {
                const messageData = <IMessageDataRebalance>data;

                embed.setColor(parseInt("0x0b8f8f", 16));
                embed.setTitle("Portfolio rebalanced");
                embed.setDescription(`Your portfolio has been rebalanced, because one or more coins fell out of the defined **market cap**.<br>Current portfolio worth is **${messageData.portfolioWorth} ${CONFIG.QUOTE}**.`)
                
                for (let i = 0; i < messageData.coins.length; i++) {
                    if ((i + 1) < 25) {
                        const coin = messageData.coins[i];
                        embed.addField(`${coin.currency}`, `${coin.direction} for ${coin.amount} ${CONFIG.QUOTE}`, true);
                    }
                    else {
                        embed.addField(`and more ...`, ``, true);
                        break;
                    }
                }
            }
            else if (type === EMessageType.REBALANCE_OVERPERFORMERS) {
                const messageData = <IMessageDataRebalance>data;

                embed.setColor(parseInt("0x0b8f8f", 16));
                embed.setTitle("Portfolio rebalanced");
                embed.setDescription(`Your portfolio has been rebalanced, because one or more coins were **overperforming**.<br>Current portfolio worth is **${messageData.portfolioWorth} ${CONFIG.QUOTE}**.`)
                
                for (let i = 0; i < messageData.coins.length; i++) {
                    if ((i + 1) < 25) {
                        const coin = messageData.coins[i];
                        embed.addField(`${coin.currency} (${coin.direction === EMessageDataRebalanceCoinDirection.SELL ? "▲" : "▼"} ${coin.percentage}%)`, `${coin.direction} for ${coin.amount} ${CONFIG.QUOTE}`, true);
                    }
                    else {
                        embed.addField(`and more ...`, ``, true);
                        break;
                    }
                }
            }
            else if (type === EMessageType.REBALANCE_UNDERPERFORMERS) {
                const messageData = <IMessageDataRebalance>data;

                embed.setColor(parseInt("0x0b8f8f", 16));
                embed.setTitle("Portfolio rebalanced");
                embed.setDescription(`Your portfolio has been rebalanced, because one or more coins were **underperforming**.<br>Current portfolio worth is **${messageData.portfolioWorth} ${CONFIG.QUOTE}**.`)
                
                for (let i = 0; i < messageData.coins.length; i++) {
                    if ((i + 1) < 25) {
                        const coin = messageData.coins[i];
                        embed.addField(`${coin.currency} (${coin.direction === EMessageDataRebalanceCoinDirection.SELL ? "▲" : "▼"} ${coin.percentage}%)`, `${coin.direction} for ${coin.amount} ${CONFIG.QUOTE}`, true);
                    }
                    else {
                        embed.addField(`and more ...`, ``, true);
                        break;
                    }
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

            this.DiscordWebHook.send(embed);
        }
    }
}

const _WebHook = new WebHook();
export { _WebHook as WebHook }