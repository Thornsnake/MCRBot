import { Database } from "./class/Database.js";

/**
 * The configuration interface. The live CONFIG object (below) is read directly throughout the bot.
 * It is loaded from — and persisted to — the single SQLite database (see class/ConfigStore.ts).
 */
export interface IConfig {
    APIKEY: string;
    SECRET: string;
    COINGECKO_API_KEY: string;
    SCHEDULE: {
        TRAILING_STOP: string;
        INVESTING: string;
        REBALANCE: string;
    };
    QUOTE: string;
    INVESTMENT: number;
    TOP: number;
    REMOVAL: number;
    INCLUDE: string[];
    EXCLUDE: string[];
    THRESHOLD: number;
    WEIGHT: { [coin: string]: number };
    TRAILING_STOP: {
        ACTIVE: boolean;
        MIN_PROFIT: number;
        MAX_DROP: number;
        RESUME: number;
    };
    IDLE_MESSAGE: string;
    WEBHOOKS: {
        DISCORD: {
            ACTIVE: boolean;
            URL: string;
            POST: {
                INVEST: boolean;
                REBALANCE_MARKET_CAP: boolean;
                REBALANCE_OVERPERFORMERS: boolean;
                REBALANCE_UNDERPERFORMERS: boolean;
                TRAILING_STOP: boolean;
                ARMED: boolean;
                CONTINUE: boolean;
            };
        };
    };
    AUTO_UPDATE: boolean;
    DRY: boolean;
    GUI: {
        ACTIVE: boolean;
        HOST: string;
        PORT: number;
        ALLOW_CONFIG: boolean;
        POLL_INTERVAL: number;
    };
}

/**
 * Built-in default configuration. On first run this is seeded into the database; afterwards the
 * stored configuration is merged on top of these defaults (so newly added fields get sane values).
 */
export const DEFAULT_CONFIG: IConfig = {
    APIKEY: "",
    SECRET: "",
    COINGECKO_API_KEY: "",
    SCHEDULE: {
        TRAILING_STOP: "30 * * * * *",
        INVESTING: "0 3 0 * * *",
        REBALANCE: "0 */5 * * * *"
    },
    QUOTE: "USD",
    INVESTMENT: 25,
    TOP: 50,
    REMOVAL: 24,
    INCLUDE: ["CRO"],
    EXCLUDE: [],
    THRESHOLD: 5,
    WEIGHT: {},
    TRAILING_STOP: {
        ACTIVE: false,
        MIN_PROFIT: 30,
        MAX_DROP: 20,
        RESUME: 72
    },
    IDLE_MESSAGE: "[CHECK] Rebalance not necessary",
    WEBHOOKS: {
        DISCORD: {
            ACTIVE: false,
            URL: "",
            POST: {
                INVEST: true,
                REBALANCE_MARKET_CAP: true,
                REBALANCE_OVERPERFORMERS: true,
                REBALANCE_UNDERPERFORMERS: true,
                TRAILING_STOP: true,
                ARMED: true,
                CONTINUE: true
            }
        }
    },
    AUTO_UPDATE: false,
    DRY: false,
    GUI: {
        ACTIVE: true,
        HOST: "127.0.0.1",
        PORT: 4100,
        ALLOW_CONFIG: true,
        POLL_INTERVAL: 30
    }
};

/**
 * Deep-merges `source` onto `target` in place. Arrays and the free-form WEIGHT map are replaced
 * wholesale; plain nested objects are merged key by key.
 */
export function deepMerge(target: any, source: any): any {
    if (source === null || source === undefined) {
        return target;
    }

    for (const key of Object.keys(source)) {
        const value = source[key];

        if (Array.isArray(value)) {
            target[key] = value.slice();
        }
        else if (value && typeof value === "object" && key !== "WEIGHT") {
            if (!target[key] || typeof target[key] !== "object") {
                target[key] = {};
            }
            deepMerge(target[key], value);
        }
        else {
            target[key] = value;
        }
    }

    return target;
}

function loadConfig(): IConfig {
    const config: IConfig = JSON.parse(JSON.stringify(DEFAULT_CONFIG));

    try {
        const row = Database.get(`SELECT "json" FROM "Config" WHERE "id" = 1`) as { json: string } | undefined;

        if (row && row.json) {
            deepMerge(config, JSON.parse(row.json));
        }
        else {
            // First run: seed the database with the defaults.
            Database.execute(`INSERT INTO "Config" ("id", "json") VALUES (1, ?)`, [JSON.stringify(config)]);
        }
    }
    catch (err) {
        console.error("[Config] Failed to load configuration from the database, using defaults:", err);
    }

    return config;
}

/**
 * The live, mutable configuration object the entire bot reads. The web GUI mutates this object in
 * place (via ConfigStore) so changes take effect on the next cron tick without a restart.
 */
export const CONFIG: IConfig = loadConfig();
