import { CronJob } from "cron";
import { Trade } from "./class/Trade.js";
import { CONFIG } from "./config.js";
import cronValidator from "cron-validator";
import Queue from "better-queue";
import { spawn } from "child_process";
import { Database } from "./class/Database.js";
import { GUIServer } from "./class/gui/GUIServer.js";

/**
 * Global safety nets. A stray rejected promise (e.g. a transient webhook or network failure) would
 * otherwise terminate the whole process on modern Node versions, which is what made the bot
 * occasionally stop without recovering (issue #12). We log such errors and keep running; the cron
 * schedules continue on their next tick.
 */
process.on("unhandledRejection", (err) => {
    console.error("Unhandled promise rejection:", err);
});

process.on("uncaughtException", (err) => {
    console.error("Uncaught exception:", err);
});

class Bot {
    private _trade: Trade;

    private _trailingStopSchedule: CronJob;
    private _investingSchedule: CronJob;
    private _rebalancingSchedule: CronJob;
    private _autoUpdateSchedule: CronJob;

    private _queue: Queue;

    private _trailingStopRunning: boolean;
    private _investingRunning: boolean;
    private _rebalancingRunning: boolean;
    private _autoUpdateRunning: boolean;
    private _schedulesStarted: boolean;

    constructor() {
        this._trade = new Trade();
        this._schedulesStarted = false;

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
         * Normalize the quote currency to upper case so it matches the exchange's instrument symbols
         * (which are always upper case, e.g. BTC_USD).
         */
        CONFIG.QUOTE = String(CONFIG.QUOTE).toUpperCase();

        /**
         * Any quote currency is allowed, as long as the exchange actually lists tradable spot pairs
         * for it (USD, USDT, BTC, EUR, ...). Rather than hard-coding a list, we verify against the
         * live instruments so that whatever the exchange supports, the bot supports too.
         */
        const instruments = await this._trade.Instrument.all();

        if (!instruments) {
            console.log("Unable to load the list of instruments from the exchange. Please try again in a moment.");
            return false;
        }

        const quoteHasPairs = instruments.some((instrument) => {
            return instrument.quote_currency.toUpperCase() === CONFIG.QUOTE;
        });

        if (!quoteHasPairs) {
            console.log(`The QUOTE currency '${CONFIG.QUOTE}' has no tradable spot pairs on the exchange. Choose a quote currency the exchange lists pairs for, for example USD (recommended, widest coverage), USDT, BTC or EUR.`);
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
            // Make sure the object value is a number.
            if (typeof weight !== "number") {
                console.log("All weights defined in the WEIGHT option must be a number!");
                return false;
            }

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
        // Open the database (the config was already loaded from it at import time).
        Database.open();

        /**
         * Define exit events to cleanly shut down the bot.
         */
        for (const exitEvent of ["SIGINT", "SIGUSR1", "SIGUSR2", "SIGTERM"]) {
            process.on(exitEvent, async () => {
                console.log(``);
                console.log(`Received ${exitEvent} signal`);
                console.log(`Shutting down`);
                console.log(``);

                this.stopSchedules();

                try {
                    GUIServer.stop();
                }
                catch (err) {
                    console.error(err);
                }

                try {
                    Database.close();
                }
                catch (err) {
                    console.error(err);
                }

                /**
                 * Actually exit the process. Previously the schedules were stopped but the process
                 * was left alive, which the process manager could interpret as a hung process and
                 * fail to restart cleanly (issue #12).
                 */
                process.exit(0);
            });
        }

        /**
         * Start the dashboard before trading, so it is reachable immediately — even when the
         * configuration is still incomplete (e.g. no API keys yet). The bot keeps running if the
         * dashboard fails to start.
         */
        if (CONFIG.GUI.ACTIVE) {
            try {
                await GUIServer.start({
                    trade: this._trade,
                    onReconfigure: (changedKeys) => this.reconfigure(changedKeys)
                });
            }
            catch (err) {
                console.error(`[GUI] Failed to start dashboard:`, err);
            }
        }

        /**
         * Validate the configuration. If it is valid, start trading. If not (e.g. the user has not
         * entered their API keys yet), leave the dashboard up so they can finish the setup in the
         * browser — trading then starts automatically via reconfigure(), without a restart.
         */
        const configurationValid = await this.check();

        if (configurationValid) {
            this.startSchedules();
        }
        else {
            console.log("Trading is paused until the configuration is valid. Open the dashboard to finish setup.");
        }
    }

    private createSchedule(name: "TRAILING_STOP" | "INVEST" | "REBALANCE"): CronJob {
        const expression =
            name === "TRAILING_STOP" ? CONFIG.SCHEDULE.TRAILING_STOP :
            name === "INVEST" ? CONFIG.SCHEDULE.INVESTING :
            CONFIG.SCHEDULE.REBALANCE;

        const job = new CronJob(expression, () => {
            if (this._autoUpdateRunning) {
                return;
            }

            this._queue.push(name);
        });

        job.start();

        return job;
    }

    private createAutoUpdateSchedule(): CronJob {
        return new CronJob("40 0 0 * * *", async () => {
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

    private startSchedules() {
        if (this._schedulesStarted) {
            return;
        }

        this._trailingStopSchedule = this.createSchedule("TRAILING_STOP");
        this._investingSchedule = this.createSchedule("INVEST");
        this._rebalancingSchedule = this.createSchedule("REBALANCE");

        if (CONFIG.AUTO_UPDATE) {
            this._autoUpdateSchedule = this.createAutoUpdateSchedule();
            this._autoUpdateSchedule.start();
        }

        this._schedulesStarted = true;

        if (CONFIG.TRAILING_STOP.ACTIVE) {
            console.log(`Trailing Stop at [${CONFIG.SCHEDULE.TRAILING_STOP}] with ${CONFIG.TRAILING_STOP.MIN_PROFIT}% min profit and ${CONFIG.TRAILING_STOP.MAX_DROP}% max drop ...`);
        }

        console.log(`Investing at [${CONFIG.SCHEDULE.INVESTING}] with ${CONFIG.INVESTMENT} ${CONFIG.QUOTE} ...`);
        console.log(`Rebalancing at [${CONFIG.SCHEDULE.REBALANCE}] with threshold of ${CONFIG.THRESHOLD}% ...`);
        console.log(``);
    }

    private stopSchedules() {
        this._trailingStopSchedule?.stop();
        this._investingSchedule?.stop();
        this._rebalancingSchedule?.stop();
        this._autoUpdateSchedule?.stop();
    }

    /**
     * Called by the web GUI after a configuration change. Recreates the cron jobs if their
     * expressions changed, and starts trading if the configuration just became valid (first-run
     * setup completed in the browser). All other settings are picked up live on the next tick.
     */
    public async reconfigure(changedKeys: string[]) {
        if (changedKeys.includes("SCHEDULE") && this._schedulesStarted) {
            this._trailingStopSchedule?.stop();
            this._investingSchedule?.stop();
            this._rebalancingSchedule?.stop();

            this._trailingStopSchedule = this.createSchedule("TRAILING_STOP");
            this._investingSchedule = this.createSchedule("INVEST");
            this._rebalancingSchedule = this.createSchedule("REBALANCE");

            console.log("[GUI] Trading schedules updated.");
        }

        if (!this._schedulesStarted) {
            const valid = await this.check();

            if (valid) {
                this.startSchedules();
                console.log("[GUI] Configuration is now valid — trading started.");
            }
        }
    }
}

const bot = new Bot();
bot.run();