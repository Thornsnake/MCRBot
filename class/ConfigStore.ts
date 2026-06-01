import cronValidator from "cron-validator";
import { CONFIG, DEFAULT_CONFIG, deepMerge, IConfig } from "../config.js";
import { Database } from "./Database.js";

/**
 * Manages the live CONFIG object: validating proposed changes, applying them in place (so the bot
 * picks them up on the next cron tick), and persisting them to the single SQLite database. This is
 * the only place that writes the configuration.
 */
class ConfigStore {
    /**
     * A deep clone of the live config with the proposed partial merged on top — used to validate a
     * change before it is applied to the live object.
     */
    public buildCandidate(partial: Partial<IConfig>): IConfig {
        const candidate: IConfig = JSON.parse(JSON.stringify(CONFIG));
        deepMerge(candidate, partial);
        return candidate;
    }

    /**
     * Validates a complete config object. Returns a list of human-readable error messages; an empty
     * list means the config is valid. (The QUOTE-has-pairs check is done by the route, which has
     * access to the live instrument list.)
     */
    public validate(cfg: IConfig): string[] {
        const errors: string[] = [];
        const cronOptions = { alias: true, allowBlankDay: true, allowSevenAsSunday: true, seconds: true };

        if (!cronValidator.isValidCron(cfg.SCHEDULE?.TRAILING_STOP ?? "", cronOptions)) {
            errors.push("SCHEDULE.TRAILING_STOP is not a valid cron expression.");
        }
        if (!cronValidator.isValidCron(cfg.SCHEDULE?.INVESTING ?? "", cronOptions)) {
            errors.push("SCHEDULE.INVESTING is not a valid cron expression.");
        }
        if (!cronValidator.isValidCron(cfg.SCHEDULE?.REBALANCE ?? "", cronOptions)) {
            errors.push("SCHEDULE.REBALANCE is not a valid cron expression.");
        }

        if (typeof cfg.QUOTE !== "string" || cfg.QUOTE.trim().length === 0) {
            errors.push("QUOTE must be a non-empty currency code.");
        }

        if (!(cfg.INVESTMENT > 0)) {
            errors.push("INVESTMENT must be larger than 0.");
        }

        if (cfg.TOP < 0 || cfg.TOP > 250) {
            errors.push("TOP must be between 0 and 250.");
        }

        if (cfg.REMOVAL < 0) {
            errors.push("REMOVAL must be 0 or greater.");
        }

        if (cfg.THRESHOLD < 1) {
            errors.push("THRESHOLD can not be lower than 1%.");
        }

        const weightSum = Object.values(cfg.WEIGHT ?? {}).reduce((acc: number, cur) => acc + (cur as number), 0);
        if (weightSum > 100) {
            errors.push("The sum of all WEIGHT values exceeds 100%.");
        }
        for (const [coin, weight] of Object.entries(cfg.WEIGHT ?? {})) {
            if (typeof weight !== "number") {
                errors.push(`WEIGHT.${coin} must be a number.`);
            }
            else if (weight <= 0) {
                errors.push(`WEIGHT.${coin} must be larger than 0%.`);
            }
            if (coin.toUpperCase() === (cfg.QUOTE ?? "").toUpperCase()) {
                errors.push("WEIGHT can not include the quote currency.");
            }
        }

        if (cfg.TRAILING_STOP.MIN_PROFIT < 1) {
            errors.push("TRAILING_STOP.MIN_PROFIT must be 1% or larger.");
        }
        if (cfg.TRAILING_STOP.MAX_DROP < 1) {
            errors.push("TRAILING_STOP.MAX_DROP must be 1% or larger.");
        }
        if (cfg.TRAILING_STOP.MIN_PROFIT <= cfg.TRAILING_STOP.MAX_DROP) {
            errors.push("TRAILING_STOP.MIN_PROFIT must be larger than TRAILING_STOP.MAX_DROP.");
        }
        if (cfg.TRAILING_STOP.RESUME < 0) {
            errors.push("TRAILING_STOP.RESUME can not be negative.");
        }

        if (!Number.isInteger(cfg.GUI.PORT) || cfg.GUI.PORT < 1 || cfg.GUI.PORT > 65535) {
            errors.push("GUI.PORT must be an integer between 1 and 65535.");
        }
        if (typeof cfg.GUI.HOST !== "string" || cfg.GUI.HOST.trim().length === 0) {
            errors.push("GUI.HOST must be a non-empty host.");
        }
        if (cfg.GUI.POLL_INTERVAL < 20) {
            errors.push("GUI.POLL_INTERVAL must be at least 20 seconds.");
        }

        return errors;
    }

    /**
     * Merges a partial config into the live CONFIG object in place and returns the set of top-level
     * keys that changed (so the caller can fire the matching re-init hooks).
     */
    public apply(partial: Partial<IConfig>): string[] {
        const before = JSON.stringify(CONFIG);
        deepMerge(CONFIG, partial);

        // Normalize QUOTE to upper case (the exchange symbols are upper case).
        if (typeof CONFIG.QUOTE === "string") {
            CONFIG.QUOTE = CONFIG.QUOTE.toUpperCase();
        }

        const changed: string[] = [];
        for (const key of Object.keys(partial)) {
            changed.push(key);
        }

        // If nothing actually changed, return an empty set.
        if (before === JSON.stringify(CONFIG)) {
            return [];
        }

        return changed;
    }

    /**
     * Persists the live CONFIG object to the database (single atomic statement).
     */
    public persist() {
        Database.execute(
            `INSERT INTO "Config" ("id", "json") VALUES (1, ?)
             ON CONFLICT ("id") DO UPDATE SET "json" = excluded."json"`,
            [JSON.stringify(CONFIG)]
        );
    }

    /**
     * A clone of the live config safe to send to the browser: the API key is masked and the secret
     * is never returned (only whether one is set).
     */
    public snapshot() {
        const clone: any = JSON.parse(JSON.stringify(CONFIG));
        clone.APIKEY = maskSecret(CONFIG.APIKEY);
        clone.SECRET = CONFIG.SECRET ? "********" : "";
        clone.SECRET_SET = !!CONFIG.SECRET;
        clone.APIKEY_SET = !!CONFIG.APIKEY;
        return clone;
    }

    /**
     * Restores the live CONFIG from a previously captured JSON string (used to roll back a bad
     * API-key change). Does not persist — the caller decides.
     */
    public restore(snapshotJson: string) {
        const previous = JSON.parse(snapshotJson);
        for (const key of Object.keys(previous)) {
            (CONFIG as any)[key] = previous[key];
        }
    }
}

function maskSecret(value: string): string {
    if (!value) {
        return "";
    }
    if (value.length <= 4) {
        return "****";
    }
    return "****" + value.slice(-4);
}

// Silence unused-import warnings for DEFAULT_CONFIG (kept exported for the GUI's "reset" affordance).
void DEFAULT_CONFIG;

const _ConfigStore = new ConfigStore();
export { _ConfigStore as ConfigStore };
