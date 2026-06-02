import { Request, Response, NextFunction } from "express";

/**
 * Minimal in-memory sliding-window rate limiter keyed by client IP. Used to throttle the auth
 * endpoints so an exposed dashboard (e.g. GUI.HOST = 0.0.0.0) cannot be brute-forced and the
 * password hashing cannot be turned into a CPU-exhaustion DoS. Kept dependency-light by design.
 */
export function rateLimit(options: { windowMs: number; max: number }) {
    const hits = new Map<string, number[]>();

    return (req: Request, res: Response, next: NextFunction) => {
        const now = Date.now();
        const windowStart = now - options.windowMs;
        const key = req.ip || req.socket.remoteAddress || "unknown";

        const timestamps = (hits.get(key) ?? []).filter((t) => t > windowStart);

        if (timestamps.length >= options.max) {
            res.status(429).json({ error: "Too many attempts. Please wait a moment and try again." });
            return;
        }

        timestamps.push(now);
        hits.set(key, timestamps);

        // Opportunistic cleanup so the map cannot grow without bound.
        if (hits.size > 1000) {
            for (const [k, ts] of hits) {
                const live = ts.filter((t) => t > windowStart);
                if (live.length === 0) {
                    hits.delete(k);
                }
                else {
                    hits.set(k, live);
                }
            }
        }

        next();
    };
}
