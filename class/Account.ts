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
            const response = await axios.post(
                "https://api.crypto.com/v2/private/get-account-summary",
                this.Authentication.sign({
                    id: 1,
                    method: "private/get-account-summary",
                    params: {
                        currency: currency.toUpperCase()
                    },
                    nonce: Date.now()
                }), {timeout: 30000});

            return response.data.result.accounts[0];
        }
        catch(err) {
            console.error(err);
        }
    }

    public async all(): Promise<IAccount[] | undefined> {
        try {
            const response = await axios.post(
                "https://api.crypto.com/v2/private/get-account-summary",
                this.Authentication.sign({
                    id: 1,
                    method: "private/get-account-summary",
                    params: {},
                    nonce: Date.now()
                }), {timeout: 30000});

            return response.data.result.accounts;
        }
        catch(err) {
            console.error(err);
        }
    }
}