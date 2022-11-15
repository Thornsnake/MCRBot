import cron from "cron";
import { Trade } from "./class/Trade.js";
import { CONFIG } from "./config.js";
import cronValidator from "cron-validator";
import Queue from "better-queue";
import { spawn } from "child_process";
import { Instrument } from "./class/Instrument.js";

class Bot {
    private _trade: Trade;

    private _trailingStopSchedule: cron.CronJob;
    private _investingSchedule: cron.CronJob;
    private _rebalancingSchedule: cron.CronJob;
    private _autoUpdateSchedule: cron.CronJob;

    private _queue: Queue;

    private _trailingStopRunning: boolean;
    private _investingRunning: boolean;
    private _rebalancingRunning: boolean;
    private _autoUpdateRunning: boolean;

    constructor() {
        this._trade = new Trade();

        this._trailingStopSchedule = null;
        this._investingSchedule = null;
        this._rebalancingSchedule = null;
        this._autoUpdateSchedule = null;

        this._queue = new Queue(async (job: string, callback: (arg0: any, arg1: any) => void) => {
            try {
                switch (job) {
                    case "TRAILING_STOP":
                        this._trailingStopRunning = true;
                        await this._trade.stop();
                        break;
                    case "INVEST":
                        this._investingRunning = true;
                        await this._trade.invest();
                        break;
                    case "REBALANCE":
                        this._rebalancingRunning = true;
                        await this._trade.rebalance();
                        break;
                    default:
                        break;
                }
            }
            catch (err) {
                console.error(err);
            }
            finally {
                switch (job) {
                    case "TRAILING_STOP":
                        this._trailingStopRunning = false;
                        break;
                    case "INVEST":
                        this._investingRunning = false;
                        break;
                    case "REBALANCE":
                        this._rebalancingRunning = false;
                        break;
                    default:
                        break;
                }

                callback(null, null);
            }
        });

        this._trailingStopRunning = false;
        this._investingRunning = false;
        this._rebalancingRunning = false;
        this._autoUpdateRunning = false;
    }

    async check() {
        /**
         * Make sure the credentials are valid an we can talk to the API.
         */
        const balance = await this._trade.Account.all();

        if (!balance) {
            console.log("Unable to connect to the API! Please make sure you've set the APIKEY and SECRET and have a network connection!");
            return false;
        }

        /**
         * Make sure the cron expressions for the schedules are valid.
         */
        if (!cronValidator.isValidCron(CONFIG.SCHEDULE.TRAILING_STOP, { alias: true, allowBlankDay: true, allowSevenAsSunday: true, seconds: true })) {
            console.log("The SCHEDULE -> TRAILING_STOP option is invalid. Please make sure you enter a valid cron expression!");
            return false;
        }

        if (!cronValidator.isValidCron(CONFIG.SCHEDULE.INVESTING, { alias: true, allowBlankDay: true, allowSevenAsSunday: true, seconds: true })) {
            console.log("The SCHEDULE -> INVESTING option is invalid. Please make sure you enter a valid cron expression!");
            return false;
        }

        if (!cronValidator.isValidCron(CONFIG.SCHEDULE.REBALANCE, { alias: true, allowBlankDay: true, allowSevenAsSunday: true, seconds: true })) {
            console.log("The SCHEDULE -> REBALANCE option is invalid. Please make sure you enter a valid cron expression!");
            return false;
        }

        /**
         * Make sure the quote currency is valid.
         */
        if (!["USD_STABLE_COIN", "BTC"].includes(CONFIG.QUOTE.toUpperCase())) {
            console.log("The currency for the QUOTE option is not valid! Choose 'USD_STABLE_COIN' or 'BTC'!");
            return false;
        }

        /**
         * Make sure the investment value is bigger than 0.
         */
        if (CONFIG.INVESTMENT <= 0) {
            console.log("The value of the INVESTMENT option must be larger than 0! Even if you are not planning to invest additional money, rebalancing can generate crypto dust which should be re-invested.");
            return false;
        }

        /**
         * Make sure the market cap limit is between 0 and 250.
         */
        if (CONFIG.TOP < 0 || CONFIG.TOP > 250) {
            console.log("The TOP option must be between 0 and 250!");
            return false;
        }

        /**
         * Make sure the coin removal time is not missing and set a default value if it is.
         */
        if (CONFIG["REMOVAL"] === undefined) {
            CONFIG["REMOVAL"] = 24;
        }

        /**
         * Make sure the coin removal time is not negative.
         */
        if (CONFIG["REMOVAL"] < 0) {
            console.log("The REMOVAL option must be 0 or greater!");
            return false;
        }

        /**
         * Make sure the rebalancing threshold is at least 1%.
         */
        if (CONFIG.THRESHOLD < 1) {
            console.log("The THRESHOLD option can not be lower than 1%!");
            return false;
        }

        /**
         * Make sure the percentage sum of the weights is not larger than 100%.
         */
        const sum = Object.entries(CONFIG.WEIGHT).reduce((acc: number, cur: [string, number]) => {
            return acc + cur[1];
        }, 0);

        if (sum > 100) {
            console.log("The sum of the defined weights in the WEIGHT option exceeds a 100%!");
            return false;
        }

        /**
         * Make sure all weights are larger than 0.
         */
        for (const weight of Object.values(CONFIG.WEIGHT)) {
            if (weight <= 0) {
                console.log("All weights defined in the WEIGHT option must be larger than 0%!");
                return false;
            }
        }

        /**
         * Make sure the weights don't include the quote currency.
         */
        for (const weight of Object.keys(CONFIG.WEIGHT)) {
            if (weight.toUpperCase() === CONFIG.QUOTE.toUpperCase()) {
                console.log("The WEIGHT option can not include the quote currency that has been set for the QUOTE option!");
                return false;
            }
        }

        /**
         * Make sure the minimum profit percentage of the trailing stop is at least 1%.
         */
        if (CONFIG.TRAILING_STOP.MIN_PROFIT < 1) {
            console.log("The TRAILING_STOP -> MIN_PROFIT option must be 1% or larger!");
            return false;
        }

        /**
         * Make sure the maximum drop percentage of the trailing stop is at least 1%.
         */
        if (CONFIG.TRAILING_STOP.MAX_DROP < 1) {
            console.log("The TRAILING_STOP -> MAX_DROP option must be 1% or larger!");
            return false;
        }

        /**
         * Make sure the minimum profit percentage of the trailing stop is larger than the maximum
         * drop percentage..
         */
        if (CONFIG.TRAILING_STOP.MIN_PROFIT <= CONFIG.TRAILING_STOP.MAX_DROP) {
            console.log("The TRAILING_STOP -> MIN_PROFIT option must be larger than the TRAILING_STOP -> MAX_DROP option!");
            return false;
        }

        /**
         * Make sure the resume option of the trailing stop is 0 or higher.
         */
        if (CONFIG.TRAILING_STOP.RESUME < 0) {
            console.log("The TRAILING_STOP -> RESUME option can not be a negative number!");
            return false;
        }

        /**
         * Make sure the idle message is not missing and set a default value if it is.
         */
        if (CONFIG["IDLE_MESSAGE"] === undefined) {
            CONFIG["IDLE_MESSAGE"] = "[CHECK] Rebalance not necessary";
        }

        /**
         * Make sure the auto update is not missing and set a default value if it is.
         */
        if (CONFIG["AUTO_UPDATE"] === undefined) {
            CONFIG["AUTO_UPDATE"] = false;
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

                if (this._trailingStopSchedule) {
                    this._trailingStopSchedule.stop();
                }

                if (this._investingSchedule) {
                    this._investingSchedule.stop();
                }

                if (this._rebalancingSchedule) {
                    this._rebalancingSchedule.stop();
                }

                if (this._autoUpdateSchedule) {
                    this._autoUpdateSchedule.stop();
                }
            });
        }

        /**
         * Initiates the trailing stop schedule.
         */
        this._trailingStopSchedule = new cron.CronJob(CONFIG.SCHEDULE.TRAILING_STOP, () => {
            if (this._autoUpdateRunning) {
                return;
            }

            this._queue.push("TRAILING_STOP");
        });

        /**
         * Initiates the investing schedule.
         */
        this._investingSchedule = new cron.CronJob(CONFIG.SCHEDULE.INVESTING, () => {
            if (this._autoUpdateRunning) {
                return;
            }

            this._queue.push("INVEST");
        });

        /**
         * Initiates the rebalancing schedule.
         */
        this._rebalancingSchedule = new cron.CronJob(CONFIG.SCHEDULE.REBALANCE, () => {
            if (this._autoUpdateRunning) {
                return;
            }

            this._queue.push("REBALANCE");
        });

        if (CONFIG["AUTO_UPDATE"]) {
            /**
             * Initiates the auto update schedule.
             * 
             * If you are reading this code, you should not mess with this cron schedule unless you
             * know what you are doing.
             */
            this._autoUpdateSchedule = new cron.CronJob("40 0 0 * * *", async () => {
                /**
                 * Wait for the process queue to be empty before starting the update process, so we do
                 * not abort any running schedules. We will wait for a total of 10 minutes. If the
                 * queue is still not empty at that time, the update will be aborted.
                 */
                try {
                    this._autoUpdateRunning = true;

                    console.log(`[UPDATE] Waiting for schedules to finish`);

                    for (let i = 0; i < 600; i++) {
                        if (this._trailingStopRunning || this._investingRunning || this._rebalancingRunning) {
                            await new Promise(resolve => setTimeout(resolve, 1000));
                        }
                        else {
                            /**
                             * Start the update child process and detach it from the parent.
                             */
                            try {
                                console.log(`[UPDATE] Checking for new updates`);

                                const subprocess = spawn("sh", ["update.sh"], {
                                    detached: true,
                                    stdio: "ignore"
                                });

                                subprocess.unref();
                            }
                            catch (err) {
                                console.error(err);
                            }

                            break;
                        }
                    }
                }
                catch (err) {
                    console.error(err);
                }
                finally {
                    this._autoUpdateRunning = false;
                }
            });
        }

        /**
         * Starts all cron jobs.
         */
        this._trailingStopSchedule.start();
        this._investingSchedule.start();
        this._rebalancingSchedule.start();

        if (CONFIG["AUTO_UPDATE"]) {
            this._autoUpdateSchedule.start();
        }

        /**
         * Ready.
         */
        if (CONFIG.TRAILING_STOP.ACTIVE) {
            console.log(`Trailing Stop at [${CONFIG.SCHEDULE.TRAILING_STOP}] with ${CONFIG.TRAILING_STOP.MIN_PROFIT}% min profit and ${CONFIG.TRAILING_STOP.MAX_DROP}% max drop ...`);
        }

        console.log(`Investing at [${CONFIG.SCHEDULE.INVESTING}] with ${CONFIG.INVESTMENT} ${CONFIG.QUOTE} ...`);
        console.log(`Rebalancing at [${CONFIG.SCHEDULE.REBALANCE}] with threshold of ${CONFIG.THRESHOLD}% ...`);
        console.log(``);
    }
}

const bot = new Bot();
bot.run();