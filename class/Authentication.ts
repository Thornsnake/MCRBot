import crypto from "crypto-js";
import { CONFIG } from "../config.js";
import { toPlainString } from "./Util.js";

export class Authentication {
    private _apiKey: string;
    private _apiSecret: string;

    constructor() {
        this._apiKey = CONFIG.APIKEY;
        this._apiSecret = CONFIG.SECRET;
    }

    /**
     * Serializes a params value into the deterministic string the Crypto.com Exchange v1 signature
     * is computed over: object keys sorted ascending and concatenated as key + value, arrays
     * concatenated element by element, numbers rendered as plain decimals (no exponential
     * notation), and null/undefined treated as empty.
     *
     * For the flat params this bot sends, the output is byte-identical to the previous
     * implementation, so existing signatures do not change — but nested structures and tiny
     * tick-size numbers are now handled correctly.
     */
    private objectToString(value: any): string {
        if (value === null || value === undefined) {
            return "";
        }

        if (Array.isArray(value)) {
            return value.reduce((acc: string, item) => acc + this.objectToString(item), "");
        }

        if (typeof value === "object") {
            return Object.keys(value)
                .sort()
                .reduce((acc, key) => acc + key + this.objectToString(value[key]), "");
        }

        if (typeof value === "number") {
            return toPlainString(value);
        }

        return String(value);
    }

    public sign(request: any) {
        const paramsString = request.params == null ? "" : this.objectToString(request.params);

        const sigPayload = request.method + request.id + this._apiKey + paramsString + request.nonce;

        request.api_key = this._apiKey;
        request.sig = crypto
            .HmacSHA256(sigPayload, this._apiSecret)
            .toString(crypto.enc.Hex);

        return request;
    }
}
