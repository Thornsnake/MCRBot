import axios from "axios";
import { IAccount } from "../interface/IAccount.js";
import { Authentication } from "./Authentication.js";

export class Account {
    private _authentication: Authentication;

    constructor() {
        this._authentication = new Authentication();
    }

    private get Authentication() {
        return this._authentication;
    }

    public async get(currency: string): Promise<IAccount | undefined> {
        try {
            const nonce = Date.now();

            const response = await axios.post(
                "https://api.crypto.com/v2/private/get-account-summary",
                this.Authentication.sign({
                    id: nonce,
                    method: "private/get-account-summary",
                    params: {
                        currency: currency.toUpperCase()
                    },
                    nonce: nonce
                }), {timeout: 30000});

            return response.data.result.accounts[0];
        }
        catch(err) {
            console.error(err);
        }
    }

    public async all(): Promise<IAccount[] | null> {
        try {
            const nonce = Date.now();

            const response = await axios.post(
                "https://api.crypto.com/v2/private/get-account-summary",
                this.Authentication.sign({
                    id: nonce,
                    method: "private/get-account-summary",
                    params: {},
                    nonce: nonce
                }), {timeout: 30000});

            const accounts: IAccount[] = [];

            for (const account of <IAccount[]>response.data.result.accounts) {
                accounts.push({
                    ...account,
                    currency: account.currency.toUpperCase() === "USD_STABLE_COIN" ? "USD" : account.currency
                });
            }

            return accounts;
        }
        catch(err) {
            console.error(err);
        }

        return null;
    }
}