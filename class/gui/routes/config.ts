import { Router, Request, Response } from "express";
import { CONFIG } from "../../../config.js";
import { ConfigStore } from "../../ConfigStore.js";
import { BotControl } from "../BotControl.js";

const router = Router();

// Current configuration (API key masked, secret never returned).
router.get("/", (_req: Request, res: Response) => {
    res.json(ConfigStore.snapshot());
});

// Apply a configuration change live (no restart).
router.put("/", async (req: Request, res: Response) => {
    if (!CONFIG.GUI.ALLOW_CONFIG) {
        res.status(403).json({ error: "Configuration editing is disabled (GUI.ALLOW_CONFIG = false)." });
        return;
    }

    const partial: any = { ...(req.body ?? {}) };

    // Ignore masked placeholders so an unchanged key/secret is never overwritten with the mask.
    if (partial.SECRET === "********" || partial.SECRET === undefined || partial.SECRET === null) {
        delete partial.SECRET;
    }
    if (typeof partial.APIKEY === "string" && partial.APIKEY.startsWith("****")) {
        delete partial.APIKEY;
    }
    // SECRET_SET / APIKEY_SET are read-only helper flags from the snapshot.
    delete partial.SECRET_SET;
    delete partial.APIKEY_SET;

    // Validate the resulting full config before touching the live one.
    const candidate = ConfigStore.buildCandidate(partial);
    const errors = ConfigStore.validate(candidate);

    if (errors.length > 0) {
        res.status(400).json({ error: errors.join(" ") });
        return;
    }

    const warnings: string[] = [];
    const trade = BotControl.Trade;

    // If the quote currency is changing, make sure the exchange actually lists pairs for it.
    const newQuote = String(candidate.QUOTE).toUpperCase();
    const quoteChanged = newQuote !== String(CONFIG.QUOTE).toUpperCase();

    if (quoteChanged && trade) {
        try {
            const instruments = await trade.Instrument.all();
            const hasPairs = !!instruments && instruments.some((i) => i.quote_currency.toUpperCase() === newQuote);

            if (!hasPairs) {
                res.status(400).json({ error: `The quote currency '${newQuote}' has no tradable spot pairs on the exchange.` });
                return;
            }

            warnings.push(`Quote currency changed to ${newQuote}. Coins held in the previous quote may not have pairs in the new one; review your portfolio.`);
        }
        catch {
            res.status(503).json({ error: "Could not verify the new quote currency against the exchange. Try again." });
            return;
        }
    }

    // Remember the previous config so a bad API-key change can be rolled back.
    const previous = JSON.stringify(CONFIG);
    const keyChanged = Object.prototype.hasOwnProperty.call(partial, "APIKEY") || Object.prototype.hasOwnProperty.call(partial, "SECRET");

    const changedKeys = ConfigStore.apply(partial);

    // If the credentials changed, probe the API and roll back if they are invalid.
    if (keyChanged && trade) {
        const balance = await trade.Account.all();

        if (!balance) {
            ConfigStore.restore(previous);
            res.status(400).json({ error: "The new API key/secret were rejected by the exchange. Reverted." });
            return;
        }
    }

    // Fire re-init hooks (recreate schedules, start trading if it wasn't running, etc.).
    try {
        await BotControl.reconfigure(changedKeys);
    }
    catch (err) {
        console.error("[GUI] reconfigure failed:", err);
    }

    // Persist the new configuration.
    try {
        ConfigStore.persist();
    }
    catch (err) {
        console.error("[GUI] Failed to persist config:", err);
    }

    res.json({ success: true, warnings, config: ConfigStore.snapshot() });
});

export default router;
