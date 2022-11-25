export interface IInstrument {
    instrument_name: string;
    quote_currency: string;
    base_currency: string;
    price_decimals: number;
    quantity_decimals: number;
    margin_trading_enabled: boolean;
    margin_trading_enabled_5x: boolean;
    margin_trading_enabled_10x: boolean;
    max_quantity: string;
    min_quantity: string;
    max_price: string;
    min_price: string;
    last_update_date: number;
    quantity_tick_size: string;
    price_tick_size: string;
}