import { Trade } from "../Trade.js";

/**
 * A small bridge that gives the web routes access to the running bot without importing the Bot class
 * (which would create a circular dependency). The Bot registers its trade instance and a reconfigure
 * callback here at startup.
 */
class BotControl {
    private _trade: Trade | null = null;
    private _onReconfigure: ((changedKeys: string[]) => Promise<void> | void) | null = null;

    public setTrade(trade: Trade) {
        this._trade = trade;
    }

    public get Trade(): Trade | null {
        return this._trade;
    }

    public setReconfigure(callback: (changedKeys: string[]) => Promise<void> | void) {
        this._onReconfigure = callback;
    }

    public async reconfigure(changedKeys: string[]) {
        if (this._onReconfigure) {
            await this._onReconfigure(changedKeys);
        }
    }
}

const _BotControl = new BotControl();
export { _BotControl as BotControl };
