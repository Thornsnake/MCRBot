/**
 * Internal canonical instrument shape used throughout the bot.
 *
 * The Crypto.com Exchange v1 `public/get-instruments` endpoint uses different field names
 * (symbol, base_ccy, quote_ccy, quote_decimals, qty_tick_size, ...). The mapping from the v1
 * response to this canonical shape happens in class/Instrument.ts, so the rest of the codebase
 * does not need to know about the API field names.
 */
export interface IInstrument {
    instrument_name: string;
    quote_currency: string;
    base_currency: string;
    price_decimals: number;
    quantity_decimals: number;
    quantity_tick_size: string;
    price_tick_size: string;
    tradable: boolean;
}
