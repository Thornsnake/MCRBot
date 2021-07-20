export interface IInstrument {
    instrument_name: string;
    quote_currency: string;
    base_currency: string;
    price_decimals: number;
    quantity_decimals: number;
    margin_trading_enabled: boolean;
}