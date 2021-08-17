import axios from "axios";
import { ITicker } from "../interface/ITicker.js";

export class Ticker {
    constructor() {}

    public async all(): Promise<ITicker[] | undefined> {
        try {
            const response = await axios.get("https://api.crypto.com/v2/public/get-ticker", {timeout: 30000});

            return response.data.result.data;
        }
        catch(err) {
            console.error(err);
        }
    }
}