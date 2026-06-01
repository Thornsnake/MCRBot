import { Router, Request, Response } from "express";
import { DataBridge } from "../DataBridge.js";

const router = Router();

// The latest per-coin distribution (drives the heatmap and the target-vs-actual bars).
router.get("/", (_req: Request, res: Response) => {
    res.json(DataBridge.getLatestDistribution());
});

// Distribution history for a single coin (drill-down).
router.get("/:coin", (req: Request, res: Response) => {
    const coin = String(req.params["coin"] || "");
    const startTime = req.query["startTime"] ? parseInt(req.query["startTime"] as string) : undefined;
    const endTime = req.query["endTime"] ? parseInt(req.query["endTime"] as string) : undefined;

    res.json({ coin: coin.toUpperCase(), entries: DataBridge.getDistributionHistory(coin, startTime, endTime) });
});

export default router;
