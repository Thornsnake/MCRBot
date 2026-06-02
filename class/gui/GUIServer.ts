import express from "express";
import http from "http";
import { Server as SocketIOServer } from "socket.io";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import { CONFIG } from "../../config.js";
import { Trade } from "../Trade.js";
import { Auth } from "./Auth.js";
import { BotControl } from "./BotControl.js";
import { DataBridge } from "./DataBridge.js";
import { authMiddleware } from "./middleware/auth.js";
import authRoutes from "./routes/auth.js";
import dashboardRoutes from "./routes/dashboard.js";
import tradeRoutes from "./routes/trades.js";
import performanceRoutes from "./routes/performance.js";
import distributionRoutes from "./routes/distribution.js";
import portfolioRoutes from "./routes/portfolio.js";
import configRoutes from "./routes/config.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface IGUIServerDeps {
    trade: Trade;
    onReconfigure: (changedKeys: string[]) => Promise<void> | void;
}

class GUIServer {
    private _app: express.Application;
    private _httpServer: http.Server;
    private _io: SocketIOServer;
    private _running: boolean;

    constructor() {
        this._app = express();
        this._httpServer = http.createServer(this._app);
        this._io = new SocketIOServer(this._httpServer, {
            cors: { origin: "*", methods: ["GET", "POST", "PUT"] }
        });
        this._running = false;
    }

    public async start(deps: IGUIServerDeps) {
        const port = CONFIG.GUI.PORT;
        const host = CONFIG.GUI.HOST;

        // Fail soft on an invalid persisted port/host instead of letting listen() throw — the bot
        // keeps trading without the dashboard, which can then be fixed once it is reachable again.
        if (!Number.isInteger(port) || port < 1 || port > 65535) {
            console.error(`[GUI] Invalid GUI.PORT (${port}); dashboard not started. Fix it in the configuration.`);
            return;
        }
        if (typeof host !== "string" || host.trim().length === 0) {
            console.error(`[GUI] Invalid GUI.HOST; dashboard not started. Fix it in the configuration.`);
            return;
        }

        // Wire the bot into the bridge + control surface.
        BotControl.setTrade(deps.trade);
        BotControl.setReconfigure(deps.onReconfigure);
        DataBridge.setTrade(deps.trade);

        // Middleware.
        this._app.use(cors());
        this._app.use(express.json());

        // Auth routes (publicly reachable for status/login/setup).
        this._app.use("/api/auth", authRoutes);

        // Everything else under /api requires a session once a password is set.
        this._app.use("/api", authMiddleware);

        this._app.use("/api/dashboard", dashboardRoutes);
        this._app.use("/api/trades", tradeRoutes);
        this._app.use("/api/performance", performanceRoutes);
        this._app.use("/api/distribution", distributionRoutes);
        this._app.use("/api/portfolio", portfolioRoutes);
        this._app.use("/api/config", configRoutes);

        // Serve the built React frontend.
        const guiDistPath = path.resolve(__dirname, "./public");
        this._app.use(express.static(guiDistPath));

        // SPA fallback for any non-API route.
        this._app.get("/{*splat}", (req, res) => {
            if (!req.path.startsWith("/api")) {
                res.sendFile(path.join(guiDistPath, "index.html"), (err) => {
                    if (err) {
                        res.status(404).json({ error: "GUI not built. Run: cd gui && npm run build" });
                    }
                });
            }
        });

        // Final error handler: return a clean 500 rather than leaking a stack trace (Express writes
        // the stack into the response body in non-production mode). A throw/rejection from any route
        // handler above lands here.
        this._app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
            console.error("[GUI] Unhandled route error:", err);
            if (!res.headersSent) {
                res.status(500).json({ error: "Internal server error." });
            }
        });

        // Socket.IO — single "dashboard" room. Require a valid token only once a password is set.
        this._io.on("connection", (socket) => {
            if (Auth.isPasswordSet()) {
                // Only accept the token from the handshake auth payload, never from the URL query
                // string (which would leak the secret token into proxy/access logs).
                const token = socket.handshake.auth?.["token"] as string | undefined;
                if (!Auth.isValidToken(token)) {
                    socket.disconnect(true);
                    return;
                }
            }

            socket.on("subscribe:dashboard", () => socket.join("dashboard"));
            socket.on("unsubscribe:dashboard", () => socket.leave("dashboard"));
        });

        DataBridge.setIO(this._io);
        DataBridge.startBroadcasting();

        await new Promise<void>((resolve, reject) => {
            this._httpServer.on("error", (err: Error) => reject(err));

            this._httpServer.listen(port, host, () => {
                console.log(`[GUI] Dashboard available at http://${host === "0.0.0.0" ? "localhost" : host}:${port}`);
                this._running = true;
                resolve();
            });
        });
    }

    public stop() {
        if (!this._running) {
            return;
        }

        DataBridge.stop();
        this._io.close();
        this._httpServer.close();
        this._running = false;
        console.log("[GUI] Dashboard stopped");
    }
}

const _GUIServer = new GUIServer();
export { _GUIServer as GUIServer };
