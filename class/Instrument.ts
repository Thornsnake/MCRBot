import axios from "axios";
import { IInstrument } from "../interface/IInstrument.js";

export class Instrument {
    constructor() {}

    public async all(): Promise<IInstrument[] | undefined> {
        try {
            const response = await axios.get("https://api.crypto.com/v2/public/get-instruments", {timeout: 30000});

            return response.data.result.instruments;
        }
        catch(err) {
            console.error(`${err.name} - ${err.message}`);
        }
    }
}