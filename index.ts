import cron, { ScheduledTask } from "node-cron";
import { Trade } from "./class/Trade.js";
import { INVESTMENT, QUOTE, SCHEDULE, THRESHOLD } from "./config.js";

class Bot {
    private _trade: Trade;
    private _investingSchedule: ScheduledTask;
    private _rebalancingSchedule: ScheduledTask;

    constructor() {
        this._trade = new Trade();
        this._investingSchedule = null;
        this._rebalancingSchedule = null;
    }

    async run() {
        // Define exit events to cleanly shut down the bot.
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

        this._investingSchedule = cron.schedule(SCHEDULE.INVESTING, async () => {
            await this._trade.invest();
        });

        this._rebalancingSchedule = cron.schedule(SCHEDULE.REBALANCE, async () => {
            await this._trade.rebalance();
        });

        console.log(`Investing at [${SCHEDULE.INVESTING}] with ${INVESTMENT.toFixed(2)} ${QUOTE} ...`);
        console.log(`Rebalancing at [${SCHEDULE.REBALANCE}] with threshold of ${THRESHOLD.toFixed(2)}% ...`);
        console.log(``);
    }
}

const bot = new Bot();
bot.run();