import { Router, Request, Response } from "express";
import { DataBridge } from "../DataBridge.js";

const router = Router();

router.get("/", (req: Request, res: Response) => {
    const startTime = req.query["startTime"] ? parseInt(req.query["startTime"] as string) : undefined;
    const endTime = req.query["endTime"] ? parseInt(req.query["endTime"] as string) : undefined;

    res.json({ entries: DataBridge.getPerformance({ startTime, endTime }) });
});

export default router;
