import { Router, Request, Response } from "express";
import { Auth } from "../Auth.js";
import { rateLimit } from "../middleware/rateLimit.js";

const router = Router();

// Throttle the credential endpoints (per IP) to blunt brute-force and password-hash DoS.
const authLimiter = rateLimit({ windowMs: 5 * 60 * 1000, max: 10 });

// Whether a password has been set yet (drives the Set-password vs Login screen).
router.get("/status", (_req: Request, res: Response) => {
    res.json({ passwordSet: Auth.isPasswordSet() });
});

// First-run: set the initial password. Only allowed while no password exists.
router.post("/setup", authLimiter, async (req: Request, res: Response) => {
    if (Auth.isPasswordSet()) {
        res.status(403).json({ error: "A password has already been set." });
        return;
    }

    const password = req.body?.password;

    if (typeof password !== "string" || password.length < 6) {
        res.status(400).json({ error: "Password must be at least 6 characters." });
        return;
    }

    await Auth.setPassword(password);
    res.json({ success: true, token: Auth.createToken() });
});

router.post("/login", authLimiter, async (req: Request, res: Response) => {
    // No password set → first-run open, no token needed.
    if (!Auth.isPasswordSet()) {
        res.json({ success: true, token: "" });
        return;
    }

    const password = req.body?.password;

    if (typeof password === "string" && await Auth.verify(password)) {
        res.json({ success: true, token: Auth.createToken() });
        return;
    }

    res.status(401).json({ success: false, error: "Invalid password." });
});

// Change the password (requires the current password).
router.post("/change", authLimiter, async (req: Request, res: Response) => {
    if (!Auth.isPasswordSet()) {
        res.status(400).json({ error: "No password has been set yet." });
        return;
    }

    const { currentPassword, newPassword } = req.body ?? {};

    if (!await Auth.verify(currentPassword ?? "")) {
        res.status(401).json({ error: "The current password is incorrect." });
        return;
    }

    if (typeof newPassword !== "string" || newPassword.length < 6) {
        res.status(400).json({ error: "The new password must be at least 6 characters." });
        return;
    }

    await Auth.setPassword(newPassword);
    res.json({ success: true, token: Auth.createToken() });
});

export default router;
