import axios from "axios";
import { IAccount } from "../interface/IAccount.js";
import { Authentication } from "./Authentication.js";
import { retry } from "./Util.js";

export class Account {
    private _authentication: Authentication;

    constructor() {
        this._authentication = new Authentication();
    }

    private get Authentication() {
        return this._authentication;
    }

    /**
     * Maps a single v1 `position_balances` entry onto the internal IAccount shape.
     *
     * The unified wallet reports a spendable figure as `max_withdrawal_balance`, which is the
     * amount available to open new orders / withdraw. `reserved_qty` is the amount locked in open
     * orders. There is no separate staking field anymore, so `stake` is always 0.
     */
    private map(balance: any): IAccount {
        const currency = (balance.instrument_name || "").toUpperCase() === "USD_STABLE_COIN" ? "USD" : balance.instrument_name;

        return {
            currency: currency,
            balance: Number(balance.quantity),
            available: Number(balance.max_withdrawal_balance),
            order: Number(balance.reserved_qty),
            stake: 0
        };
    }

    public async get(currency: string): Promise<IAccount | undefined> {
        /**
         * The v1 user-balance endpoint has no per-currency variant, so we fetch all balances and
         * filter. Only used to double-check the CRO balance before selling (fee currency).
         */
        const accounts = await this.all();

        if (!accounts) {
            return undefined;
        }

        return accounts.find((account) => account.currency.toUpperCase() === currency.toUpperCase());
    }

    public async all(): Promise<IAccount[] | null> {
        try {
            const nonce = Date.now();

            const response = await retry(() => axios.post(
                "https://api.crypto.com/exchange/v1/private/user-balance",
                this.Authentication.sign({
                    id: nonce,
                    method: "private/user-balance",
                    params: {},
                    nonce: nonce
                }),
                { timeout: 30000, headers: { "Content-Type": "application/json" } }
            ));

            const positionBalances = response.data?.result?.data?.[0]?.position_balances;

            if (!positionBalances) {
                return [];
            }

            const accounts: IAccount[] = [];

            for (const balance of positionBalances) {
                accounts.push(this.map(balance));
            }

            return accounts;
        }
        catch (err) {
            console.error(err);
        }

        return null;
    }
}
