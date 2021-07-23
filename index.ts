import cronJob, { ScheduledTask } from "node-cron";
import { Trade } from "./class/Trade.js";
import { INVESTMENT, QUOTE, SCHEDULE, THRESHOLD, TOP, WEIGHT } from "./config.js";
import cronValidator from "cron-validator";

class Bot {
    private _trade: Trade;
    private _investingSchedule: ScheduledTask;
    private _rebalancingSchedule: ScheduledTask;

    constructor() {
        this._trade = new Trade();
        this._investingSchedule = null;
        this._rebalancingSchedule = null;
    }

    async check() {
        /**
         * Make sure the credentials are valid an we can talk to the API.
         */
        try {
            await this._trade.Account.all();
        }
        catch(err) {
            console.log("Unable to connect to the API! Please make sure you've set the APIKEY and SECRET and have a network connection!")
            console.log(err);
            return false;
        }

        /**
         * Make sure the cron expressions for the schedules are valid.
         */
        if (!cronValidator.isValidCron(SCHEDULE.INVESTING)) {
            console.log("The SCHEDULE -> INVESTING option is invalid. Please make sure you enter a valid cron expression!")
            return false;
        }

        if (!cronValidator.isValidCron(SCHEDULE.REBALANCE)) {
            console.log("The SCHEDULE -> REBALANCE option is invalid. Please make sure you enter a valid cron expression!")
            return false;
        }

        /**
         * Make sure the quote currency is valid.
         */
        if (!["USDT", "USDC", "BTC", "CRO"].includes(QUOTE.toUpperCase())) {
            console.log("The currency for the QUOTE option is not valid! Choose 'USDT', 'USDC', 'BTC' or 'CRO'!");
            return false;
        }

        /**
         * Make sure the investment value is bigger than 0.
         */
        if (INVESTMENT <= 0) {
            console.log("The value of the INVESTMENT option must be larger than 0! Even if you are not planning to invest additional money, rebalancing can generate crypto dust which should be re-invested.");
            return false;
        }

        /**
         * Make sure the market cap limit is between 0 and 250.
         */
        if (TOP < 0 || TOP > 250) {
            console.log("The TOP option must be between 0 and 250!");
            return false;
        }

        /**
         * Make sure the rebalancing threshold is at least 1%.
         */
        if (THRESHOLD < 1) {
            console.log("The THRESHOLD option can not be lower than 1%!");
            return false;
        }

        /**
         * Make sure the percentage sum of the weights is not larger than 100%.
         */
        const sum = Object.entries(WEIGHT).reduce((acc, cur) => {
            return acc + cur[1];
        }, 0);

        if (sum > 100) {
            console.log("The sum of the defined weights in the WEIGHT option exceeds a 100%!");
            return false;
        }

        /**
         * Make sure all weights are larger than 0.
         */
        for (const weight of Object.values(WEIGHT)) {
            if (weight <= 0) {
                console.log("All weights defined in the WEIGHT option must be larger than 0%!");
                return false;
            }
        }

        /**
         * Make sure the weights don't include the quote currency.
         */
         for (const weight of Object.keys(WEIGHT)) {
            if (weight.toUpperCase() === QUOTE.toUpperCase()) {
                console.log("The WEIGHT option can not include the quote currency that has been set for the QUOTE option!");
                return false;
            }
        }

        return true;
    }

    async run() {
        const configurationValid = await this.check();

        if (!configurationValid) {
            return;
        }

        /**
         * Define exit events to cleanly shut down the bot.
         */
        for (const exitEvent of ["SIGINT", "SIGUSR1", "SIGUSR2", "SIGTERM"]) {
            process.on(exitEvent, async () => {
                console.log(``);
                console.log(`Received ${exitEvent} signal`);
                console.log(`Shutting down`);
                console.log(``);

                if (this._investingSchedule) {
                    this._investingSchedule.stop();
                }

                if (this._rebalancingSchedule) {
                    this._rebalancingSchedule.stop();
                }
            });
        }

        /**
         * Initiates the investing schedule.
         */
        this._investingSchedule = cronJob.schedule(SCHEDULE.INVESTING, async () => {
            await this._trade.invest();
        });

        /**
         * Initiates the rebalancing schedule.
         */
        this._rebalancingSchedule = cronJob.schedule(SCHEDULE.REBALANCE, async () => {
            await this._trade.rebalance();
        });

        /**
         * Ready.
         */
        console.log(`Investing at [${SCHEDULE.INVESTING}] with ${INVESTMENT.toFixed(2)} ${QUOTE} ...`);
        console.log(`Rebalancing at [${SCHEDULE.REBALANCE}] with threshold of ${THRESHOLD.toFixed(2)}% ...`);
        console.log(``);
    }
}

const bot = new Bot();
bot.run();