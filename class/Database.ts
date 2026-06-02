import BetterSQLite from "better-sqlite3";
import fs from "fs";
import path from "path";

/**
 * The single SQLite database that holds EVERYTHING the bot consumes or produces: the configuration,
 * the trailing-stop state, the coin removal list, and the full history (trades, portfolio snapshots,
 * distribution snapshots and events).
 *
 * better-sqlite3 is fully synchronous, which lets config.ts read the configuration at import time
 * (before the import-time singletons such as WebHook are constructed). The connection is therefore
 * opened lazily and synchronously on first use.
 */
class Database {
    private _path: string;
    private _database: BetterSQLite.Database | null;
    private _tables: string[];

    constructor() {
        this._path = "./data/database.sqlite3";
        this._database = null;
        this._tables = [];

        // --- Configuration (single row) ---
        this._tables.push(`
            CREATE TABLE IF NOT EXISTS "Config" (
                "id"    INTEGER NOT NULL PRIMARY KEY,
                "json"  TEXT    NOT NULL
            );
        `);

        // --- Web GUI authentication (single row) ---
        this._tables.push(`
            CREATE TABLE IF NOT EXISTS "Auth" (
                "id"     INTEGER NOT NULL PRIMARY KEY,
                "hash"   TEXT    NOT NULL,
                "salt"   TEXT    NOT NULL
            );
        `);

        // --- Trailing-stop state (single row) ---
        this._tables.push(`
            CREATE TABLE IF NOT EXISTS "PortfolioATH" (
                "id"            INTEGER NOT NULL PRIMARY KEY,
                "investment"    REAL    NOT NULL DEFAULT 0,
                "all_time_high" REAL    NOT NULL DEFAULT 0,
                "active"        INTEGER NOT NULL DEFAULT 0,
                "triggered"     INTEGER NOT NULL DEFAULT 0,
                "resume"        INTEGER NOT NULL DEFAULT 0
            );
        `);

        // --- Coins pending removal from the portfolio ---
        this._tables.push(`
            CREATE TABLE IF NOT EXISTS "CoinRemovalList" (
                "coin"     TEXT    NOT NULL PRIMARY KEY,
                "execute"  INTEGER NOT NULL
            );
        `);

        // --- Trade history ---
        this._tables.push(`
            CREATE TABLE IF NOT EXISTS "Trades" (
                "trade_id"       INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
                "timestamp"      INTEGER NOT NULL,
                "coin"           TEXT    NOT NULL,
                "side"           TEXT    NOT NULL,
                "type"           TEXT    NOT NULL,
                "quote_amount"   REAL    NOT NULL,
                "base_quantity"  REAL,
                "price"          REAL,
                "quote"          TEXT    NOT NULL,
                "dry"            INTEGER NOT NULL DEFAULT 0
            );
        `);
        this._tables.push(`CREATE INDEX IF NOT EXISTS "Idx_Trades_Time" ON "Trades" ("timestamp")`);
        this._tables.push(`CREATE INDEX IF NOT EXISTS "Idx_Trades_Coin" ON "Trades" ("coin", "timestamp")`);

        // --- Portfolio worth / basis snapshots (for the performance chart) ---
        this._tables.push(`
            CREATE TABLE IF NOT EXISTS "PortfolioSnapshots" (
                "timestamp"         INTEGER NOT NULL PRIMARY KEY,
                "worth"             REAL    NOT NULL,
                "investment_basis"  REAL    NOT NULL,
                "available_funds"   REAL    NOT NULL,
                "all_time_high"     REAL    NOT NULL DEFAULT 0,
                "ts_active"         INTEGER NOT NULL DEFAULT 0,
                "ts_triggered"      INTEGER NOT NULL DEFAULT 0
            );
        `);

        // --- Per-coin distribution snapshots (for the heatmap history) ---
        this._tables.push(`
            CREATE TABLE IF NOT EXISTS "DistributionSnapshots" (
                "timestamp"   INTEGER NOT NULL,
                "coin"        TEXT    NOT NULL,
                "target"      REAL    NOT NULL,
                "actual"      REAL    NOT NULL,
                "deviation"   REAL    NOT NULL,
                "percentage"  REAL    NOT NULL,

                PRIMARY KEY ("timestamp", "coin")
            );
        `);
        this._tables.push(`CREATE INDEX IF NOT EXISTS "Idx_Dist_Time" ON "DistributionSnapshots" ("timestamp")`);
        this._tables.push(`CREATE INDEX IF NOT EXISTS "Idx_Dist_Coin" ON "DistributionSnapshots" ("coin", "timestamp")`);
    }

    /**
     * Returns the open connection, opening (and initializing) it synchronously on first use.
     */
    private connection(): BetterSQLite.Database {
        if (this._database) {
            return this._database;
        }

        const directory = path.dirname(this._path);

        if (!fs.existsSync(directory)) {
            fs.mkdirSync(directory, { recursive: true });
        }

        const database = new BetterSQLite(this._path);

        database.pragma("journal_mode = WAL");
        database.pragma("synchronous = normal");
        database.pragma("temp_store = memory");
        database.pragma("foreign_keys = ON");

        for (const table of this._tables) {
            database.exec(table);
        }

        this._database = database;

        return database;
    }

    public open() {
        // Force the lazy connection to open so startup fails fast if the DB is unusable.
        this.connection();
        return true;
    }

    public close() {
        if (this._database) {
            this._database.close();
            this._database = null;
        }
    }

    public execute(command: string, params: any[] = []) {
        return this.connection().prepare(command).run(params);
    }

    public get(command: string, params: any[] = []) {
        return this.connection().prepare(command).get(params);
    }

    public all(command: string, params: any[] = []) {
        return this.connection().prepare(command).all(params);
    }

    public transaction(fn: () => void) {
        this.connection().transaction(fn)();
    }
}

const _Database = new Database();
export { _Database as Database };
