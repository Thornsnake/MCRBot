import crypto from "crypto";
import { Database } from "../Database.js";

/**
 * Web GUI authentication. The password is stored salted-hashed (scrypt) in the database — never in
 * plaintext. Session tokens are random and kept in memory (lost on restart, requiring re-login).
 *
 * When no password is set (fresh install), the dashboard is open so the user can complete the
 * first-run setup; the frontend forces a "set password" step on first login.
 */
class Auth {
    private _tokens = new Set<string>();

    public isPasswordSet(): boolean {
        return !!Database.get(`SELECT "id" FROM "Auth" WHERE "id" = 1`);
    }

    public setPassword(password: string) {
        const salt = crypto.randomBytes(16).toString("hex");
        const hash = crypto.scryptSync(password, salt, 64).toString("hex");

        Database.execute(
            `INSERT INTO "Auth" ("id", "hash", "salt") VALUES (1, ?, ?)
             ON CONFLICT ("id") DO UPDATE SET "hash" = excluded."hash", "salt" = excluded."salt"`,
            [hash, salt]
        );

        // Changing the password invalidates all existing sessions.
        this._tokens.clear();
    }

    public verify(password: string): boolean {
        const row = Database.get(`SELECT "hash", "salt" FROM "Auth" WHERE "id" = 1`) as { hash: string; salt: string } | undefined;

        if (!row) {
            return false;
        }

        const hash = crypto.scryptSync(password, row.salt, 64).toString("hex");
        const a = Buffer.from(hash, "hex");
        const b = Buffer.from(row.hash, "hex");

        return a.length === b.length && crypto.timingSafeEqual(a, b);
    }

    public createToken(): string {
        const token = crypto.randomBytes(32).toString("hex");
        this._tokens.add(token);
        return token;
    }

    public isValidToken(token: string | undefined | null): boolean {
        return !!token && this._tokens.has(token);
    }

    public revoke(token: string) {
        this._tokens.delete(token);
    }
}

const _Auth = new Auth();
export { _Auth as Auth };
