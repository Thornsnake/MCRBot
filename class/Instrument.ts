import axios from "axios";
import { IInstrument } from "../interface/IInstrument.js";
import { retry } from "./Util.js";

export class Instrument {
    constructor() {}

    public async all(): Promise<IInstrument[] | undefined> {
        try {
            const response = await retry(() => axios.get(
                "https://api.crypto.com/exchange/v1/public/get-instruments",
                { timeout: 30000 }
            ));

            // The v1 API can return an error envelope (HTTP 200, no `result`) on maintenance/edge
            // responses, which retry() does not retry. Guard the dereference so it returns cleanly
            // (callers already treat a falsy result as "skip this cycle") instead of throwing.
            const data = response.data?.result?.data;

            if (!Array.isArray(data)) {
                console.error(`get-instruments returned an unexpected response (code: ${response.data?.code}). Skipping this cycle.`);
                return undefined;
            }

            const instruments: IInstrument[] = [];

            for (const instrument of data) {
                /**
                 * Only spot currency pairs are tradable by this bot. Skip perpetuals, futures and
                 * any instrument the exchange has flagged as not tradable.
                 */
                if (instrument.inst_type !== "CCY_PAIR" || !instrument.tradable) {
                    continue;
                }

                instruments.push({
                    instrument_name: instrument.symbol,
                    base_currency: instrument.base_ccy,
                    /**
                     * Legacy guard: the old v2 API exposed a synthetic "USD_STABLE_COIN" quote. The
                     * v1 API uses plain "USD", but we keep this normalization so the bot behaves
                     * identically should either value ever appear.
                     */
                    quote_currency: instrument.quote_ccy.toUpperCase() === "USD_STABLE_COIN" ? "USD" : instrument.quote_ccy,
                    price_decimals: Number(instrument.quote_decimals),
                    quantity_decimals: Number(instrument.quantity_decimals),
                    price_tick_size: instrument.price_tick_size,
                    quantity_tick_size: instrument.qty_tick_size,
                    tradable: instrument.tradable
                });
            }

            return instruments;
        }
        catch (err) {
            console.error(err);
        }
    }
}
