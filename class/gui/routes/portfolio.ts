import { Router, Request, Response } from "express";
import { DataBridge } from "../DataBridge.js";

const router = Router();

// Trailing-stop state + the coin removal list.
router.get("/", (_req: Request, res: Response) => {
    res.json(DataBridge.getPortfolioState());
});

router.get("/events", (req: Request, res: Response) => {
    const limit = parseInt(req.query["limit"] as string) || 50;
    res.json({ events: DataBridge.getEvents(limit) });
});

export default router;
