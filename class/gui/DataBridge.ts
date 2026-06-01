import { Server as SocketIOServer } from "socket.io";
import { CONFIG } from "../../config.js";
import { Database } from "../Database.js";
import { Trade } from "../Trade.js";
import { ICycleSnapshot, ITradeRecord } from "../../interface/IDashboard.js";

const PERSIST_INTERVAL_MS = 10 * 60 * 1000; // persist a snapshot at most every 10 minutes

/**
 * The bridge between the running bot and the dashboard. It receives trade/cycle notifications from
 * the bot, persists history to SQLite, runs an independent live poll for the heatmap, and exposes the
 * read queries the REST routes use.
 */
class DataBridge {
    private _io: SocketIOServer | null = null;
    private _trade: Trade | null = null;
    private _pollTimer: ReturnType<typeof setInterval> | undefined;
    private _initialTimer: ReturnType<typeof setTimeout> | undefined;
    private _lastPersist = 0;

    public setIO(io: SocketIOServer) {
        this._io = io;
    }

    public setTrade(trade: Trade) {
        this._trade = trade;
        // Route the bot's trade/cycle events through this bridge.
        trade.setListeners(
            (record) => this.notifyTrade(record),
            (snapshot) => this.notifyCycle(snapshot)
        );
    }

    // ---- live poll -------------------------------------------------------

    public startBroadcasting() {
        if (!this._trade) {
            return;
        }

        const intervalMs = Math.max(20, CONFIG.GUI.POLL_INTERVAL) * 1000;

        const tick = async () => {
            try {
                const snapshot = await this._trade?.snapshot();
                if (snapshot) {
                    this.broadcastSnapshot(snapshot, false);
                }
            }
            catch (err) {
                console.error("[GUI] Poll failed:", err);
            }
        };

        // Run once shortly after startup, then on the configured interval.
        this._initialTimer = setTimeout(tick, 2000);
        this._pollTimer = setInterval(tick, intervalMs);
    }

    public stop() {
        if (this._pollTimer) {
            clearInterval(this._pollTimer);
            this._pollTimer = undefined;
        }
        if (this._initialTimer) {
            clearTimeout(this._initialTimer);
            this._initialTimer = undefined;
        }
    }

    // ---- notifications from the bot -------------------------------------

    public notifyTrade(record: ITradeRecord) {
        try {
            Database.execute(
                `INSERT INTO "Trades"
                    ("timestamp", "coin", "side", "type", "quote_amount", "base_quantity", "price", "quote", "dry")
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    record.timestamp,
                    record.coin,
                    record.side,
                    record.type,
                    record.quoteAmount,
                    record.baseQuantity,
                    record.price,
                    CONFIG.QUOTE,
                    record.dry ? 1 : 0
                ]
            );
        }
        catch (err) {
            console.error("[GUI] Failed to record trade:", err);
        }

        this._io?.to("dashboard").emit("trade:new", { trade: { ...record, quote: CONFIG.QUOTE } });
    }

    public notifyCycle(snapshot: ICycleSnapshot) {
        this.broadcastSnapshot(snapshot, true);
        this._io?.to("dashboard").emit("cycle:complete", { type: snapshot.type, timestamp: snapshot.timestamp });
    }

    // ---- broadcasting + persistence -------------------------------------

    private broadcastSnapshot(snapshot: ICycleSnapshot, fromCycle: boolean) {
        const distribution = snapshot.distribution.map((coin) => ({
            coin: coin.name,
            target: coin.target,
            actual: coin.target + coin.deviation,
            deviation: coin.deviation,
            percentage: coin.percentage
        }));

        this._io?.to("dashboard").emit("portfolio:update", {
            timestamp: snapshot.timestamp,
            worth: snapshot.portfolioWorth,
            availableFunds: snapshot.availableFunds,
            investmentBasis: snapshot.trailingStop.investment,
            allTimeHigh: snapshot.trailingStop.allTimeHigh,
            trailingStop: {
                active: snapshot.trailingStop.active,
                triggered: snapshot.trailingStop.triggered,
                resume: snapshot.trailingStop.resume
            },
            quote: CONFIG.QUOTE
        });

        this._io?.to("dashboard").emit("distribution:update", {
            timestamp: snapshot.timestamp,
            quote: CONFIG.QUOTE,
            distribution
        });

        // Persist a snapshot from cycles always, and from polls at most every PERSIST_INTERVAL_MS.
        const now = snapshot.timestamp;
        if (fromCycle || this._lastPersist === 0 || now - this._lastPersist >= PERSIST_INTERVAL_MS) {
            this.persistSnapshot(snapshot);
            this._lastPersist = now;
        }
    }

    private persistSnapshot(snapshot: ICycleSnapshot) {
        try {
            Database.execute(
                `INSERT OR REPLACE INTO "PortfolioSnapshots"
                    ("timestamp", "worth", "investment_basis", "available_funds", "all_time_high", "ts_active", "ts_triggered")
                 VALUES (?, ?, ?, ?, ?, ?, ?)`,
                [
                    snapshot.timestamp,
                    snapshot.portfolioWorth,
                    snapshot.trailingStop.investment,
                    snapshot.availableFunds,
                    snapshot.trailingStop.allTimeHigh,
                    snapshot.trailingStop.active ? 1 : 0,
                    snapshot.trailingStop.triggered ? 1 : 0
                ]
            );

            if (snapshot.distribution.length > 0) {
                Database.transaction(() => {
                    for (const coin of snapshot.distribution) {
                        Database.execute(
                            `INSERT OR REPLACE INTO "DistributionSnapshots"
                                ("timestamp", "coin", "target", "actual", "deviation", "percentage")
                             VALUES (?, ?, ?, ?, ?, ?)`,
                            [
                                snapshot.timestamp,
                                coin.name,
                                coin.target,
                                coin.target + coin.deviation,
                                coin.deviation,
                                coin.percentage
                            ]
                        );
                    }
                });
            }
        }
        catch (err) {
            console.error("[GUI] Failed to persist snapshot:", err);
        }
    }

    public recordEvent(type: string, coin: string | null, message: string | null) {
        try {
            Database.execute(
                `INSERT INTO "Events" ("timestamp", "type", "coin", "message") VALUES (?, ?, ?, ?)`,
                [Date.now(), type, coin, message]
            );
        }
        catch (err) {
            console.error("[GUI] Failed to record event:", err);
        }
    }

    // ---- REST data access ------------------------------------------------

    public getDashboard() {
        const snapshot = Database.get(
            `SELECT * FROM "PortfolioSnapshots" ORDER BY "timestamp" DESC LIMIT 1`
        ) as any;

        const trailingStop = Database.get(
            `SELECT "investment", "all_time_high", "active", "triggered", "resume" FROM "PortfolioATH" WHERE "id" = 1`
        ) as any;

        const removalCount = (Database.get(`SELECT COUNT(*) AS "count" FROM "CoinRemovalList"`, []) as any)?.count ?? 0;

        return {
            quote: CONFIG.QUOTE,
            dry: CONFIG.DRY,
            worth: snapshot?.worth ?? 0,
            availableFunds: snapshot?.available_funds ?? 0,
            investmentBasis: snapshot?.investment_basis ?? (trailingStop?.investment ?? 0),
            allTimeHigh: trailingStop?.all_time_high ?? 0,
            trailingStop: {
                enabled: CONFIG.TRAILING_STOP.ACTIVE,
                active: !!(trailingStop?.active),
                triggered: !!(trailingStop?.triggered),
                resume: trailingStop?.resume ?? 0
            },
            removalCount,
            recentTrades: this.getRecentTrades(10),
            distribution: this.getLatestDistribution()
        };
    }

    public getRecentTrades(limit = 10) {
        return Database.all(
            `SELECT * FROM "Trades" ORDER BY "timestamp" DESC LIMIT ?`,
            [limit]
        ) ?? [];
    }

    public getTrades(filters: { coin?: string; side?: string; type?: string; dry?: string; limit?: number; offset?: number }) {
        const conditions: string[] = [];
        const params: any[] = [];

        if (filters.coin) {
            conditions.push(`"coin" = ?`);
            params.push(filters.coin.toUpperCase());
        }
        if (filters.side) {
            conditions.push(`"side" = ?`);
            params.push(filters.side.toUpperCase());
        }
        if (filters.type) {
            conditions.push(`"type" = ?`);
            params.push(filters.type.toLowerCase());
        }
        if (filters.dry === "true" || filters.dry === "false") {
            conditions.push(`"dry" = ?`);
            params.push(filters.dry === "true" ? 1 : 0);
        }

        const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
        const limit = filters.limit ?? 100;
        const offset = filters.offset ?? 0;

        const total = (Database.get(`SELECT COUNT(*) AS "total" FROM "Trades" ${where}`, params) as any)?.total ?? 0;
        const trades = Database.all(
            `SELECT * FROM "Trades" ${where} ORDER BY "timestamp" DESC LIMIT ? OFFSET ?`,
            [...params, limit, offset]
        ) ?? [];

        return { trades, total };
    }

    public getPerformance(filters: { startTime?: number; endTime?: number }) {
        const conditions: string[] = [];
        const params: any[] = [];

        if (filters.startTime) {
            conditions.push(`"timestamp" >= ?`);
            params.push(filters.startTime);
        }
        if (filters.endTime) {
            conditions.push(`"timestamp" <= ?`);
            params.push(filters.endTime);
        }

        const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

        return Database.all(
            `SELECT "timestamp", "worth", "investment_basis", "available_funds", "all_time_high"
             FROM "PortfolioSnapshots" ${where} ORDER BY "timestamp" ASC`,
            params
        ) ?? [];
    }

    public getLatestDistribution() {
        const latest = Database.get(`SELECT MAX("timestamp") AS "timestamp" FROM "DistributionSnapshots"`, []) as any;

        if (!latest || !latest.timestamp) {
            return { timestamp: 0, coins: [] };
        }

        const coins = Database.all(
            `SELECT "coin", "target", "actual", "deviation", "percentage"
             FROM "DistributionSnapshots" WHERE "timestamp" = ? ORDER BY "actual" DESC`,
            [latest.timestamp]
        ) ?? [];

        return { timestamp: latest.timestamp, quote: CONFIG.QUOTE, coins };
    }

    public getDistributionHistory(coin: string, startTime?: number, endTime?: number) {
        const conditions = [`"coin" = ?`];
        const params: any[] = [coin.toUpperCase()];

        if (startTime) {
            conditions.push(`"timestamp" >= ?`);
            params.push(startTime);
        }
        if (endTime) {
            conditions.push(`"timestamp" <= ?`);
            params.push(endTime);
        }

        return Database.all(
            `SELECT "timestamp", "deviation", "percentage", "actual", "target"
             FROM "DistributionSnapshots" WHERE ${conditions.join(" AND ")} ORDER BY "timestamp" ASC`,
            params
        ) ?? [];
    }

    public getPortfolioState() {
        const trailingStop = Database.get(
            `SELECT "investment", "all_time_high", "active", "triggered", "resume" FROM "PortfolioATH" WHERE "id" = 1`
        ) as any;

        const removalList = Database.all(`SELECT "coin", "execute" FROM "CoinRemovalList" ORDER BY "execute" ASC`, []) ?? [];

        return {
            quote: CONFIG.QUOTE,
            trailingStop: {
                enabled: CONFIG.TRAILING_STOP.ACTIVE,
                investment: trailingStop?.investment ?? 0,
                allTimeHigh: trailingStop?.all_time_high ?? 0,
                active: !!(trailingStop?.active),
                triggered: !!(trailingStop?.triggered),
                resume: trailingStop?.resume ?? 0
            },
            removalList
        };
    }

    public getEvents(limit = 50) {
        return Database.all(`SELECT * FROM "Events" ORDER BY "timestamp" DESC LIMIT ?`, [limit]) ?? [];
    }
}

const _DataBridge = new DataBridge();
export { _DataBridge as DataBridge };
