import axios from "axios";
import { IInstrument } from "../interface/IInstrument.js";

export class Instrument {
    constructor() {}

    public async all(): Promise<IInstrument[] | undefined> {
        try {
            const response = await axios.get("https://api.crypto.com/v2/public/get-instruments", {timeout: 30000});

            const instruments: IInstrument[] = [];

            for (const instrument of <IInstrument[]>response.data.result.instruments) {
                instruments.push({
                    ...instrument,
                    quote_currency: instrument.quote_currency.toUpperCase() === "USD_STABLE_COIN" ? "USD" : instrument.quote_currency
                });
            }

            return instruments;
        }
        catch(err) {
            console.error(err);
        }
    }
}