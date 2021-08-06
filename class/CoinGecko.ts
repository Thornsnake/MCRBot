import axios from "axios";
import { CONFIG } from "../config.js";
import { ICoin } from "../interface/ICoin.js";

export class CoinGecko {
    constructor() {}

    public async getStablecoins(): Promise<string[] | undefined> {
        try {
            const result = [];

            if (CONFIG.TOP < 1) {
                return result;
            }

            const response = await axios.get(
                `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&category=stablecoins&order=market_cap_desc&per_page=${CONFIG.TOP}&page=1&sparkline=false`
            );

            const coins: ICoin[] = response.data;

            for (const coin of coins) {
                if (coin.market_cap_rank > CONFIG.TOP) {
                    continue;
                }

                result.push(coin.symbol.toUpperCase());
            }

            return result;
        }
        catch(err) {
            console.error(err);
        }
    }

    public async getCoins(): Promise<string[] | undefined> {
        try {
            const result = [];

            if (CONFIG.TOP < 1) {
                return result;
            }

            const response = await axios.get(
                `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=${CONFIG.TOP}&page=1&sparkline=false`
            );

            const coins: ICoin[] = response.data;

            for (const coin of coins) {
                if (coin.market_cap_rank > CONFIG.TOP) {
                    continue;
                }

                result.push(coin.symbol.toUpperCase());
            }

            return result;
        }
        catch(err) {
            console.error(err);
        }
    }
}