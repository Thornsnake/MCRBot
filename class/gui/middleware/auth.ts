import { Request, Response, NextFunction } from "express";
import { Auth } from "../Auth.js";

/**
 * Protects the API. The /api/auth/* routes are mounted BEFORE this middleware, so checking status
 * and setting the initial password stay reachable on a fresh install. Everything else (config,
 * dashboard data, trades, ...) requires a password to exist and a valid session token — so an
 * unauthenticated client cannot write API keys or flip the bind address during the setup window.
 */
export function authMiddleware(req: Request, res: Response, next: NextFunction) {
    // No password yet → force first-run setup before any data/config route is usable.
    if (!Auth.isPasswordSet()) {
        res.status(401).json({ error: "Set a dashboard password first." });
        return;
    }

    const header = req.headers.authorization;

    if (header && header.startsWith("Bearer ")) {
        const token = header.substring(7);
        if (Auth.isValidToken(token)) {
            next();
            return;
        }
    }

    res.status(401).json({ error: "Unauthorized" });
}
