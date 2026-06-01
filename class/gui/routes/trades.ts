import { Router, Request, Response } from "express";
import { DataBridge } from "../DataBridge.js";

const router = Router();

router.get("/", (req: Request, res: Response) => {
    res.json(DataBridge.getTrades({
        coin: req.query["coin"] as string | undefined,
        side: req.query["side"] as string | undefined,
        type: req.query["type"] as string | undefined,
        dry: req.query["dry"] as string | undefined,
        limit: parseInt(req.query["limit"] as string) || 100,
        offset: parseInt(req.query["offset"] as string) || 0
    }));
});

export default router;
