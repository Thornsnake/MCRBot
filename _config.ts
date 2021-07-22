/**
 * The API Key and Secret from the crypto.com exchange.
 */
export const APIKEY = "xxxxxxxxxxxxxxxxxxxxxx";
export const SECRET = "xxxxxxxxxxxxxxxxxxxxxx";

/**
 * Schedules in cron format.
 * Check https://crontab.guru/ if you want to double check your schedule.
 * 
 * By default, investing happens 5 minutes after midnight every day. Rebalancing happens every
 * 15 minutes.
 */
export const SCHEDULE = {
    INVESTING: "5 0 * * *",
    REBALANCE: "0,15,30,45 */1 * * *"
};

/**
 * The quote currency of your exchange pairs. Can be "USDT", "USDC", "BTC" or "CRO". Please
 * consider that if you set the quote currency to "BTC" or "CRO", the INVESTMENT option must also
 * be set in that currency.
 * 
 * 25 USDT/USDC at time of writing this would be about 0.0008 BTC or 230 CRO.
 */
export const QUOTE = "USDT";

/**
 * The amount of quote currency that you want to invest per investing interval. The investing
 * interval is the cronjob interval you've set for the SCHEDULE->INVESTING option. Every time a new
 * investment is made, this amount will be split over all coins within the market cap.
 * 
 * If there are 50 coins within the market cap with the INVESTMENT option set to 25 USDT, the
 * used amount that will be invested into each coin will be 25/50, so 0.5 USDT.
 * 
 * WARNING!
 * If you set this amount too low and have too many coins to trade on, the investment amount per
 * coin could fall beneath the minimum required amount to buy a particular coin. To prevent the
 * exchange from rejecting such an order, a buy order amount that is too low will be automatically
 * set to the minimum required amount. Because of this, the bot can end up investing more money per
 * interval than you've set here.
 * 
 * YOU CAN NOT REBALANCE THE TOP 100 COINS BY MARKET CAP IF ALL YOU HAVE ARE $5.00!
 * RAISE THE INVESTMENT AMOUNT, OR CHOOSE A LOWER AMOUNT OF COINS!
 */
export const INVESTMENT = 25;

/**
 * The top x coins by market cap that the bot should invest into and rebalance. If a coin falls out
 * of this limit, it will be sold and the money will be rebalanced into the remaining coins or the
 * coin that replaced it.
 * 
 * If you do not care about the market cap and want to have a manual list with coins to trade on,
 * set the TOP option to 0. Only the coins in the INCLUDE option will then be traded.
 */
export const TOP = 50;

/**
 * Coins that should be included for investing and rebalancing, even if they fall out of the set
 * market cap limit.
 */
export const INCLUDE = ["USDC", "CRO"];

/**
 * Coins that should be excluded from investing and rebalancing, even if they are within the set
 * market cap limit.
 */
export const EXCLUDE = ["DOGE", "SHIB"];

/**
 * The maximum deviation in percent that a coin can have before rebalancing kicks in. This works in
 * both directions.
 * 
 * If this option is set to 5%, then overperformers that deviate +5% or more from the average will
 * be brought back to the average and the sold amount will be re-invested into the worst performing
 * coins.
 * 
 * If this option is set to 5%, then underperformers that deviate -5% or more from the average will
 * be brought back to the average by first selling the best performing coins and then re-investing
 * the sold amount into the underperforming coins.
 */
export const THRESHOLD = 5;

/**
 * The weight in percent you want each coin to have in your portfolio. The total percentage of all
 * values combined can not be larger than 100. If the total percentage of all values does not
 * reach 100, the remaining percent will be split over all other coins.
 * 
 * Be aware that defining a weight here will not automatically include the coin to be traded. It
 * still must either be within the set market cap or be present in the INCLUDE option.
 */
 export const WEIGHT: { [key: string]: number } = {
    "USDC": 10,
    "BTC": 10
};

/**
 * Will only do a dry run and output trade logs as if the trades took place. The trades will not be
 * executed.
 * 
 * WARNING!
 * This is a debug flag and should be left at false. You can most likely just ignore this option.
 */
export const DRY = false;