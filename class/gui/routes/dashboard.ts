import { Router, Request, Response } from "express";
import { DataBridge } from "../DataBridge.js";

const router = Router();

router.get("/", (_req: Request, res: Response) => {
    res.json(DataBridge.getDashboard());
});

export default router;
