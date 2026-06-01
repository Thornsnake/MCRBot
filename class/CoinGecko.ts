import axios from "axios";
import { CONFIG } from "../config.js";
import { ICoin } from "../interface/ICoin.js";
import { retry } from "./Util.js";

export class CoinGecko {
    private _stablecoinCache: string[];
    private _coinCache: string[];

    constructor() {
        this._stablecoinCache = undefined;
        this._coinCache = undefined;
    }

    private get stablecoinCache() {
        return this._stablecoinCache;
    }

    private set stablecoinCache(val: string[]) {
        this._stablecoinCache = val;
    }

    private get coinCache() {
        return this._coinCache;
    }

    private set coinCache(val: string[]) {
        this._coinCache = val;
    }

    /**
     * Builds the axios request config, attaching the optional CoinGecko demo API key if one has been
     * configured. The key is read defensively so that configs created before this option existed
     * still compile and run. A key is not required — the keyless public API still works — but using
     * one raises the rate limit and improves reliability.
     */
    private requestConfig() {
        const apiKey = (CONFIG as any).COINGECKO_API_KEY;
        const config: any = { timeout: 30000 };

        if (apiKey && typeof apiKey === "string" && apiKey.trim().length > 0) {
            config.headers = { "x-cg-demo-api-key": apiKey.trim() };
        }

        return config;
    }

    public async getStablecoins(cached: boolean): Promise<string[] | undefined> {
        if (cached && this.stablecoinCache) {
            return this.stablecoinCache;
        }

        try {
            const result = [];

            if (CONFIG.TOP < 1) {
                return result;
            }

            const response = await retry(() => axios.get(`https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&category=stablecoins&order=market_cap_desc&per_page=${CONFIG.TOP}&page=1&sparkline=false`, this.requestConfig()));

            const coins: ICoin[] = response.data;

            for (const coin of coins) {
                if (coin.market_cap_rank > CONFIG.TOP) {
                    continue;
                }

                result.push(coin.symbol.toUpperCase());
            }

            this.stablecoinCache = result;

            return result;
        }
        catch(err) {
            console.error(`${err.name} - ${err.message}`);

            if (this.stablecoinCache) {
                return this.stablecoinCache;
            }
        }
    }

    public async getCoins(cached: boolean): Promise<string[] | undefined> {
        if (cached && this.coinCache) {
            return this.coinCache;
        }

        try {
            const result = [];

            if (CONFIG.TOP < 1) {
                return result;
            }

            const response = await retry(() => axios.get(`https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=${CONFIG.TOP}&page=1&sparkline=false`, this.requestConfig()));

            const coins: ICoin[] = response.data;

            for (const coin of coins) {
                if (coin.market_cap_rank > CONFIG.TOP) {
                    continue;
                }

                result.push(coin.symbol.toUpperCase());
            }

            this.coinCache = result;

            return result;
        }
        catch(err) {
            console.error(`${err.name} - ${err.message}`);

            if (this.coinCache) {
                return this.coinCache;
            }
        }
    }
}
