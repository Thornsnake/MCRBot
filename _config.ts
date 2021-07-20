/**
 * The API Key and Secret from the 
 */
export const APIKEY = "xxxxxxxxxxxxxxxxxxxxxx";
export const SECRET = "xxxxxxxxxxxxxxxxxxxxxx";

/**
 * Schedules in cron format.
 * Check https://crontab.guru/ if you want to double check your schedule.
 */
export const SCHEDULE = {
    INVESTING: "5 0 * * *",
    REBALANCE: "0,15,30,45 */1 * * *"
};

export const TOP = 100;

export const QUOTE = "USDT";

export const INCLUDE = ["USDC", "CRO"];
export const EXCLUDE = ["DOGE", "SHIB"];

export const THRESHOLD = 5;
export const INVESTMENT = 0.5;