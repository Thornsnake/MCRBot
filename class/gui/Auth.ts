import crypto from "crypto";
import { promisify } from "util";
import { Database } from "../Database.js";

// Async scrypt so password hashing does not block the single event loop the trading cron ticks
// share (a flood of login attempts could otherwise stall trading).
const scryptAsync = promisify(crypto.scrypt) as (password: string, salt: string, keylen: number) => Promise<Buffer>;

/**
 * Web GUI authentication. The password is stored salted-hashed (scrypt) in the database — never in
 * plaintext. Session tokens are random, kept in memory (lost on restart), carry a TTL, and the live
 * set is capped so a scripted login loop cannot grow it without bound.
 *
 * When no password is set (fresh install), the frontend forces a "set password" step on first login;
 * the auth middleware refuses every other route until that password exists.
 */
class Auth {
    private _tokens = new Map<string, number>(); // token -> expiry (epoch ms)
    private static readonly TTL_MS = 24 * 60 * 60 * 1000; // 24h
    private static readonly MAX_TOKENS = 100;

    public isPasswordSet(): boolean {
        return !!Database.get(`SELECT "id" FROM "Auth" WHERE "id" = 1`);
    }

    public async setPassword(password: string) {
        const salt = crypto.randomBytes(16).toString("hex");
        const hash = (await scryptAsync(password, salt, 64)).toString("hex");

        Database.execute(
            `INSERT INTO "Auth" ("id", "hash", "salt") VALUES (1, ?, ?)
             ON CONFLICT ("id") DO UPDATE SET "hash" = excluded."hash", "salt" = excluded."salt"`,
            [hash, salt]
        );

        // Changing the password invalidates all existing sessions.
        this._tokens.clear();
    }

    public async verify(password: string): Promise<boolean> {
        const row = Database.get(`SELECT "hash", "salt" FROM "Auth" WHERE "id" = 1`) as { hash: string; salt: string } | undefined;

        if (!row) {
            return false;
        }

        const hash = (await scryptAsync(password, row.salt, 64)).toString("hex");
        const a = Buffer.from(hash, "hex");
        const b = Buffer.from(row.hash, "hex");

        return a.length === b.length && crypto.timingSafeEqual(a, b);
    }

    public createToken(): string {
        const token = crypto.randomBytes(32).toString("hex");

        // Evict the oldest token if the set is full (insertion order).
        if (this._tokens.size >= Auth.MAX_TOKENS) {
            const oldest = this._tokens.keys().next().value;
            if (oldest) {
                this._tokens.delete(oldest);
            }
        }

        this._tokens.set(token, Date.now() + Auth.TTL_MS);
        return token;
    }

    public isValidToken(token: string | undefined | null): boolean {
        if (!token) {
            return false;
        }

        const expiry = this._tokens.get(token);

        if (expiry === undefined) {
            return false;
        }

        if (Date.now() > expiry) {
            this._tokens.delete(token);
            return false;
        }

        return true;
    }

    public revoke(token: string) {
        this._tokens.delete(token);
    }
}

const _Auth = new Auth();
export { _Auth as Auth };
