import { Request, Response, NextFunction } from "express";
import { Auth } from "../Auth.js";

/**
 * Protects the API. While no password is set (fresh install) everything is open so the user can
 * complete first-run setup; once a password exists a valid session token is required.
 */
export function authMiddleware(req: Request, res: Response, next: NextFunction) {
    // No password yet → first-run, allow everything.
    if (!Auth.isPasswordSet()) {
        next();
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
