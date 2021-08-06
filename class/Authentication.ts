import crypto from "crypto-js";
import { CONFIG } from "../config.js";

export class Authentication {
    private _apiKey: string;
    private _apiSecret: string;

    constructor() {
        this._apiKey = CONFIG.APIKEY;
        this._apiSecret = CONFIG.SECRET;
    }

    public sign(request: any) {
        const paramsString =
            request.params == null
                ? ""
                : Object.keys(request.params)
                    .sort()
                    .reduce((a, b) => {
                        return a + b + request.params[b];
                    }, "");

        const sigPayload = request.method + request.id + this._apiKey + paramsString + request.nonce;

        request.api_key = this._apiKey;
        request.sig = crypto
            .HmacSHA256(sigPayload, this._apiSecret)
            .toString(crypto.enc.Hex);

        return request;
    }
}