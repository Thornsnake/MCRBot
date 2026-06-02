import { Router, Request, Response } from "express";
import { DataBridge } from "../DataBridge.js";

const router = Router();

// Trailing-stop state + the coin removal list.
router.get("/", (_req: Request, res: Response) => {
    res.json(DataBridge.getPortfolioState());
});

export default router;
